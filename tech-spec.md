# Technical Spec — runspend

## 1. Stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 15 (App Router) + TypeScript** | Single deployable, RSC for dashboard reads |
| UI | **Tailwind + shadcn/ui + Tremor** | Tremor = pre-built analytics charts, fast |
| ORM | **Drizzle ORM** | Lightweight, SQL-first, great TS types |
| DB | **Postgres** (Railway-managed) | |
| Cache / queues | **Redis** (Railway-managed) | |
| Background jobs | **BullMQ** | Repeatable jobs handle scheduling — no separate cron |
| Auth | **Auth.js v5 (NextAuth)** with GitHub provider | |
| GitHub integration | **GitHub App** + **Octokit** | App for org access, OAuth for user identity |
| Billing | **Stripe** (Checkout + Customer Portal + webhooks) | |
| Email | **Resend** | (v2 for digests; install now for transactional) |
| Errors | **Sentry** | |
| Logs/metrics | **Railway built-in** + structured pino logs | |

## 2. Repo / service layout

```
runspend/
├── apps/
│   └── web/                   # Next.js app (UI + API routes + RSC)
├── workers/
│   └── ingest/                # BullMQ worker process (separate Railway service)
├── packages/
│   ├── db/                    # Drizzle schema + migrations + client
│   ├── github/                # Octokit wrappers, cost calc, ingest logic
│   ├── billing/               # Stripe wrappers, plan limits
│   └── shared/                # Types, env validation (zod), logger
├── package.json               # pnpm workspaces
└── turbo.json
```

- **pnpm workspaces + Turborepo** for monorepo.
- **Two Railway services from one repo**: `web` (Next.js) and `worker` (Node entrypoint).

## 3. Data model (Drizzle)

```
users
  id (uuid, pk)
  github_user_id (bigint, unique)
  email, name, avatar_url
  created_at, updated_at

organizations
  id (uuid, pk)
  github_org_id (bigint, unique)
  github_login (text)
  installation_id (bigint, unique)  -- GitHub App install
  stripe_customer_id (text, nullable)
  plan (enum: trial|starter|growth|scale|cancelled)
  trial_ends_at, created_at

org_memberships
  user_id (fk), org_id (fk), role (enum: owner|member)
  unique(user_id, org_id)

repositories
  id (uuid, pk)
  org_id (fk)
  github_repo_id (bigint, unique)
  name, default_branch, is_private (bool)
  active (bool)  -- counts toward plan limit
  last_ingested_run_id (bigint, nullable)

workflows
  id, repo_id (fk), github_workflow_id (bigint, unique)
  name, path, state

workflow_runs
  id (uuid, pk)
  workflow_id (fk), repo_id (fk), org_id (fk) -- denormalized for query speed
  github_run_id (bigint, unique)
  run_number, event, status, conclusion
  head_branch, head_sha, actor_login
  started_at, completed_at
  total_duration_ms (int)        -- end-to-end
  billable_duration_ms (int)     -- sum of jobs' billable_duration
  estimated_cost_usd (numeric(10,4))

workflow_jobs
  id (uuid, pk)
  run_id (fk), org_id (fk)
  github_job_id (bigint, unique)
  name, status, conclusion
  runner_os (enum: ubuntu|windows|macos|self-hosted)
  runner_label, runner_size (text, nullable)  -- e.g. "ubuntu-latest", "ubuntu-4-core"
  started_at, completed_at
  billable_duration_ms (int)
  estimated_cost_usd (numeric(10,4))

ingest_jobs
  id, org_id (fk), kind (enum: backfill|incremental)
  status (enum: pending|running|completed|failed)
  cursor (text, nullable)         -- last run_id processed
  started_at, completed_at, error (text, nullable)

subscriptions
  id, org_id (fk, unique)
  stripe_subscription_id, stripe_price_id
  status, current_period_end
  cancel_at_period_end (bool)
```

**Indexes**: `workflow_runs(org_id, started_at desc)`, `workflow_runs(workflow_id, started_at desc)`, `workflow_jobs(run_id)`, partial index on `repositories(org_id) where active = true`.

## 4. GitHub integration

### 4.1 App + OAuth split
- **GitHub App** (`runspend`): installed on the org. Provides installation token (used by workers) for reading workflow runs/jobs.
- **OAuth (Sign in with GitHub)**: identifies the user, used only at login. Stored in `users.github_user_id`.

### 4.2 GitHub App permissions
- **Actions**: Read
- **Metadata**: Read
- **Contents**: Read (for default branch info; reconsider if we can drop)
- **Webhooks subscribed**: `workflow_run` (for near-real-time updates), `installation`, `installation_repositories`

### 4.3 Ingest strategy
- **Backfill** (on first install): pull last 30 days of `workflow_runs` per active repo, then jobs per run. Process in batches of 50 runs concurrently per repo, max 5 repos in parallel per worker.
- **Incremental** (hourly via BullMQ repeatable): per repo, `since = last_ingested_run.completed_at`, fetch new completed runs, fetch their jobs.
- **Webhook** (`workflow_run.completed`): enqueue a single-run ingest job — gives ~near-real-time without polling pressure.
- **Rate limit handling**: respect `X-RateLimit-Remaining`; back off with exponential delay; persist cursor so jobs are idempotent.

### 4.4 Cost calculation
- Use GitHub-published per-minute rates (hardcoded constants, versioned in `packages/github/pricing.ts`):
  - Linux 2-core: $0.008/min
  - Windows 2-core: $0.016/min
  - macOS 3-core: $0.08/min
  - Larger runners: separate rate table
- Billable duration = `job.completed_at - job.started_at`, rounded up to nearest minute *per job* (matches GitHub billing).
- Run cost = sum of job costs.
- Self-hosted runners: cost = 0, but counted separately ("self-hosted minutes").
- **Validation hook**: monthly job that hits `/orgs/{org}/settings/billing/actions` and stores delta vs our calculated total — surfaces calc drift.

## 5. Auth flow

1. User visits `/login` → "Sign in with GitHub" → Auth.js OAuth flow.
2. After login, if user has no org connected → `/onboarding/install` → "Install runspend on GitHub" → redirects to GitHub App install URL.
3. GitHub redirects back with `installation_id` → backend validates user is admin of that org → creates `organizations` row, links `org_memberships`.
4. Enqueue backfill `ingest_job` → user lands on dashboard with "Importing your data..." state that polls until first runs appear.

## 6. Billing flow (Stripe)

- On org create → 14-day trial (`plan = 'trial'`, `trial_ends_at = now + 14d`). No Stripe customer yet.
- "Upgrade" button → create Stripe customer + Checkout session for the chosen price → success URL flips `plan` and stores `stripe_subscription_id`.
- Stripe webhook handler at `/api/webhooks/stripe`: subscription created/updated/deleted/payment_failed → reconcile `subscriptions` + `organizations.plan`.
- Plan enforcement: nightly job marks oldest-touched repos beyond plan limit as `active = false` (and skips them on next ingest). Dashboard surfaces this clearly.
- Customer portal link from `/settings/billing` for self-serve management.

## 7. Railway deployment

- **Services**:
  1. `web` — Next.js (`pnpm --filter web start`), public domain.
  2. `worker` — `pnpm --filter ingest start` (Node process running BullMQ workers + scheduler).
  3. `postgres` — Railway plugin.
  4. `redis` — Railway plugin.
- **Env vars** (validated via zod in `packages/shared/env.ts`):
  - `DATABASE_URL`, `REDIS_URL` (auto-injected by Railway)
  - `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_WEBHOOK_SECRET`, `GITHUB_APP_CLIENT_ID`, `GITHUB_APP_CLIENT_SECRET`
  - `AUTH_SECRET`, `AUTH_URL`
  - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_STARTER`, `STRIPE_PRICE_GROWTH`, `STRIPE_PRICE_SCALE`
  - `RESEND_API_KEY`, `SENTRY_DSN`, `ENCRYPTION_KEY` (for any tokens we store)
- **Build**: Railway detects Nixpacks; explicit `nixpacks.toml` per service to set the start command.
- **Migrations**: run on `web` startup via `drizzle-kit migrate` (idempotent). Lock with advisory lock to avoid race on multi-instance.

## 8. Security

- All GitHub installation tokens are short-lived (1 hour) — fetch on demand, never persist.
- Webhook signatures validated for both GitHub and Stripe.
- CSRF protection via Auth.js defaults.
- Rate limit unauthenticated routes (e.g. `/api/webhooks/github`) by IP via Redis + sliding window.
- `helmet`-equivalent headers via Next.js middleware (CSP, HSTS, X-Frame-Options).
- No customer source code, no secrets, no logs from runs — only metadata.

## 9. Observability

- **Sentry** for errors (web + worker).
- **Pino** structured logs → Railway log drain.
- **Health endpoints**: `/api/health` (web), worker exposes `:9100/health`.
- **Internal admin page** (`/admin`, restricted by env-allowlisted email) showing: orgs, last ingest status, recent failures.

## 10. Out of scope reminders

- No flake detection (v2)
- No email digest (v2)
- No recommendation engine (v2)
- No SSO beyond GitHub OAuth (v2+)
- No team / role granularity beyond `owner|member` (v2)

