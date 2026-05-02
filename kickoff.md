# Claude Code Kickoff

A sequence of prompts to drive the build. Run them in order. After each milestone, review, commit, and start a fresh Claude Code session for the next.

---

## Bootstrapping prompt (run this first, in an empty repo)

> You are bootstrapping a new project called `runspend`. Read `PRD.md`, `TECHNICAL_SPEC.md`, and `CLAUDE.md` in the repo root before doing anything else. Do not skim — internalize the constraints in `CLAUDE.md`.
>
> Your job in this first session is **only** to set up the monorepo skeleton:
>
> 1. Initialize a pnpm + Turborepo monorepo at the layout described in `TECHNICAL_SPEC.md` § 2.
> 2. Create the four packages (`db`, `github`, `billing`, `shared`) with empty `package.json` and `index.ts` exporting nothing yet.
> 3. Create `apps/web` as a fresh Next.js 15 (App Router, TypeScript, Tailwind) app, with shadcn/ui initialized.
> 4. Create `workers/ingest` as a Node TypeScript package with a placeholder `src/index.ts` that just logs "ingest worker started".
> 5. Set up Biome at the root with the rules described in `CLAUDE.md`.
> 6. Set up `tsconfig.json` with strict mode, `noUncheckedIndexedAccess: true`, and workspace path aliases.
> 7. Add `.env.example` with every env var listed in `TECHNICAL_SPEC.md` § 7.
> 8. Add a root `README.md` with setup steps.
> 9. Commit with message: `chore: bootstrap monorepo`.
>
> **Do not** add any business logic, DB schema, auth, or routes in this session. **Do not** install dependencies you weren't asked for. **Do not** scaffold pages beyond the default Next.js home page. Stop when the skeleton is in place and `pnpm typecheck` passes across the workspace.

---

## Milestone 1 — Database + auth (next session)

> Read `PRD.md`, `TECHNICAL_SPEC.md`, `CLAUDE.md` again.
>
> Implement:
>
> 1. In `packages/db`: Drizzle setup against Postgres, schema for `users`, `organizations`, `org_memberships` per `TECHNICAL_SPEC.md` § 3 (only those three tables this milestone).
> 2. Drizzle migration generated and committed.
> 3. In `apps/web`: Auth.js v5 with the GitHub provider. Sign-in route at `/login`, callback handled, session backed by the `users` table (custom adapter writing to Drizzle).
> 4. Middleware that protects all routes except `/login`, `/api/auth/*`, `/api/health`, and `/`.
> 5. A placeholder `/dashboard` page that renders the signed-in user's email.
> 6. A `/api/health` route returning `{ ok: true }`.
> 7. Tests: at least one integration test that signs a user in via Auth.js test helpers and asserts a `users` row was created.
>
> Stop here. Do not start on the GitHub App flow yet.

---

## Milestone 2 — GitHub App install + ingest skeleton

> Read the docs again. This milestone wires up GitHub App installation and the ingest queue, but does not yet calculate costs.
>
> 1. Add the remaining tables from `TECHNICAL_SPEC.md` § 3: `repositories`, `workflows`, `workflow_runs`, `workflow_jobs`, `ingest_jobs`. Generate the migration.
> 2. In `packages/github`: an Octokit factory that takes an `installation_id` and returns an authenticated client (using App JWT → installation token, cached in Redis with TTL = 50 minutes).
> 3. In `apps/web`: `/onboarding/install` page with a button that links to the GitHub App install URL.
> 4. Callback route `/api/github/install/callback` that validates the user is an admin of the installed org and creates the `organizations` + `org_memberships` rows, then redirects to the dashboard.
> 5. Webhook route `/api/webhooks/github` that validates signature and handles `installation`, `installation_repositories`, `workflow_run` events. For now, just log the events and enqueue a placeholder BullMQ job.
> 6. In `workers/ingest`: BullMQ queue + worker setup connected to Redis. One queue: `ingest`. Worker reads jobs and logs them. No real ingest yet.
> 7. Add a Railway-ready `nixpacks.toml` per service (`apps/web`, `workers/ingest`).
>
> Stop here.

---

## Milestone 3 — Real ingest + cost calculation

> Implement the actual ingest pipeline:
>
> 1. In `packages/github`: `pricing.ts` constants + `calculateJobCost(job)` and `calculateRunCost(run)` functions. Cover Linux/Windows/macOS standard runners and self-hosted (cost = 0). Unit tests for each runner type, including the per-job minute rounding rule.
> 2. In `packages/github`: `ingestRepositoryRuns(installationId, repoId, since)` that pages through the Actions runs API, fetches jobs per run, computes costs, upserts rows. Idempotent on `github_run_id`.
> 3. BullMQ jobs:
>    - `backfill-org` (fanout to per-repo jobs, 30-day window, max 5 concurrent repos)
>    - `incremental-org` (repeatable every hour, uses `repositories.last_ingested_run_id` cursor)
>    - `single-run` (triggered from `workflow_run` webhook)
> 4. Wire the install callback (Milestone 2) to enqueue `backfill-org`.
> 5. Tests: integration test that mocks GitHub API responses and asserts runs+jobs are persisted with correct cost.
>
> Stop here.

---

## Milestone 4 — Dashboard

> Build the dashboard described in `PRD.md` § 5 (US-4, US-5):
>
> 1. `/dashboard` (server component): total spend last 30d, daily spend trend (Tremor `AreaChart`), top 10 workflows by cost (Tremor `BarList`), top 10 repos by cost, breakdown by runner OS (Tremor `DonutChart`).
> 2. `/dashboard/workflows/[id]` (server component): per-workflow run table with duration, status, cost, branch, actor.
> 3. Empty/loading states for users whose backfill hasn't completed.
> 4. Skeleton + Suspense boundaries — initial paint must be fast even if some queries are slow.
> 5. All queries scoped to the user's active org via session.
>
> No charts beyond what `PRD.md` § 5 requires.

---

## Milestone 5 — Stripe billing

> Per `TECHNICAL_SPEC.md` § 6:
>
> 1. `packages/billing`: Stripe client, helpers for creating customer, creating checkout session, creating portal session.
> 2. `/api/billing/checkout` route → returns a Checkout session URL for the chosen price.
> 3. `/api/billing/portal` → returns a Customer Portal session URL.
> 4. `/api/webhooks/stripe` handler — sig validation, handles `customer.subscription.{created,updated,deleted}` and `invoice.payment_failed`. Reconciles `subscriptions` and `organizations.plan`.
> 5. Plan enforcement: nightly BullMQ job `enforce-plan-limits` that deactivates excess repos beyond plan limit (`repositories.active = false`).
> 6. `/settings/billing` page: shows current plan, trial countdown, upgrade buttons, manage-billing link.
> 7. Trial logic: org gets `plan = 'trial'` for 14 days on creation. After expiry, dashboard becomes read-only with an upgrade banner.

---

## Milestone 6 — Polish + ship

> Final pre-launch:
>
> 1. Sentry integration (web + worker), pino logger.
> 2. `/admin` page (env-allowlisted email) showing orgs, ingest job status, recent failures.
> 3. Status page (simple — can be a static page reading from a Redis-backed health record).
> 4. `/legal/terms` and `/legal/privacy` placeholders.
> 5. Marketing landing page at `/` with the pricing table from `PRD.md` § 6 and a "Sign in with GitHub" CTA.
> 6. README updated with full local dev setup, including how to register a dev GitHub App.
> 7. Smoke test script: spin up against staging Railway env, install on a test org, verify dashboard populates within 15 minutes.

---

## Notes for using these prompts

- **Always** start a fresh Claude Code session per milestone — long sessions drift.
- After each milestone, **manually review the diff** before merging. Don't blind-trust.
- If Claude Code suggests adding a dependency or pattern not in `CLAUDE.md`, push back or ask why.
- Keep `PRD.md`, `TECHNICAL_SPEC.md`, and `CLAUDE.md` updated as you make decisions — they are the project's memory.
- If a milestone produces > ~1500 lines of diff, it's probably doing too much. Split it.

