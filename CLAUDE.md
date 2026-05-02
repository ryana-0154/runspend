# CLAUDE.md

Guidance for Claude Code working in this repo. Read this before making changes.

## Project context

- Product: SaaS that analyzes GitHub Actions cost/spend.
- See `PRD.md` for product scope.
- See `TECHNICAL_SPEC.md` for architecture and data model.
- v1 is **cost analytics only** — flake detection, digest emails, and recommendations are deliberately out of scope.

## Core principles

- **Type safety end-to-end**. No `any`. No `as` casts unless interacting with untyped third-party APIs.
- **Server-first**. Default to React Server Components and server actions. Client components only when interaction requires it (`"use client"` at the top).
- **Boring is good**. Prefer the most obvious solution. No clever metaprogramming.
- **Idempotency everywhere**. Ingest jobs, webhooks, migrations — all must be safe to re-run.
- **Money is `numeric`, not `float`**. Always.

## Directory rules

- `apps/web/` — Next.js only. No business logic beyond UI orchestration.
- `packages/db/` — Drizzle schema + migrations + a typed client. Nothing else.
- `packages/github/` — All GitHub API calls go here. Octokit imports forbidden elsewhere.
- `packages/billing/` — All Stripe API calls go here. Stripe imports forbidden elsewhere.
- `packages/shared/` — Cross-cutting types, env validation, logger, error classes.
- `workers/ingest/` — BullMQ workers + queue definitions. Imports `packages/github` for ingest logic.

## Coding conventions

- **Language**: TypeScript strict mode. `noUncheckedIndexedAccess: true`.
- **Style**: Biome (formatter + linter). Run `pnpm biome check --apply` before commits.
- **Imports**: Use workspace aliases (`@runspend/db`, `@runspend/github`, etc.) — never relative paths across packages.
- **Async**: `async/await`, never raw `.then()` chains.
- **Errors**: Throw typed errors from `packages/shared/errors.ts`. Never throw bare `Error`.
- **Env**: Read only via `packages/shared/env.ts` (zod-validated). Never reference `process.env` directly elsewhere.
- **Logging**: `import { logger } from "@runspend/shared/logger"` — pino, structured. No `console.log` in production code.
- **Dates**: Always store/return UTC. Use `Date` objects in TS, `timestamptz` in DB.

## Database conventions

- All schema changes go through Drizzle migrations (`pnpm db:generate` then commit the SQL).
- **Never** edit a migration after it's merged to `main`.
- Every table has `id uuid primary key default gen_random_uuid()` unless documented otherwise.
- Every table has `created_at timestamptz default now()`.
- Foreign keys use `on delete cascade` only when child rows are meaningless without parent (think hard before adding it elsewhere).
- Use `db.transaction()` for any write touching multiple tables.

## Testing

- **Unit tests**: Vitest. Co-located as `*.test.ts`.
- **Integration tests**: hit a real Postgres (Testcontainers or `pnpm test:db` against a local instance).
- **Don't mock the DB**. Mock GitHub and Stripe at the SDK boundary using their official mock helpers / nock.
- **Coverage target**: not enforced numerically. Cover cost calculation, webhook handlers, and plan-limit enforcement thoroughly. Skip trivial UI components.

## Git / PR conventions

- Branch names: `feat/<short>`, `fix/<short>`, `chore/<short>`.
- Commit style: Conventional Commits (`feat(ingest): handle workflow_run webhook`).
- Squash-merge only.
- PR description must list: what changed, why, how tested, any new env vars or migrations.

## Things to NOT do

- Don't add a new dependency without flagging it in the PR description with justification.
- Don't introduce a new external service (auth provider, queue, cache) without explicit approval.
- Don't store GitHub installation tokens in the database — fetch on demand.
- Don't store anything from a workflow run beyond metadata. No logs, no artifacts, no source.
- Don't add per-seat pricing logic — pricing is flat per tier.
- Don't add features from the v2 list in `PRD.md` § 3.
- Don't write to `process.env` at runtime.
- Don't use `dangerouslySetInnerHTML` anywhere.
- Don't add an ORM other than Drizzle. Don't add a query builder on top of Drizzle.

## When unsure

- If a task is ambiguous, **ask before implementing**.
- If a task seems to expand scope beyond v1, **flag it and ask** rather than building.
- If you find yourself writing the same logic in two places, stop and extract to `packages/shared` or the relevant domain package.

## Useful scripts

```
pnpm dev               # run web + worker locally with Turborepo
pnpm db:generate       # generate Drizzle migration from schema diff
pnpm db:migrate        # apply pending migrations
pnpm db:studio         # Drizzle studio
pnpm test              # run all tests
pnpm typecheck         # tsc --noEmit across workspace
pnpm lint              # biome check
```

