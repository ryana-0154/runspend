# runspend

SaaS that analyzes GitHub Actions cost/spend across an organization's workflows, repos, and runners.

See [`prd.md`](./prd.md) for product scope, [`tech-spec.md`](./tech-spec.md) for architecture, and [`CLAUDE.md`](./CLAUDE.md) for engineering rules.

## Repo layout

```
runspend/
├── apps/
│   └── web/          # Next.js 15 (App Router) — UI + API routes + RSC
├── workers/
│   └── ingest/       # BullMQ worker process
├── packages/
│   ├── db/           # Drizzle schema, migrations, client
│   ├── github/       # Octokit wrappers, cost calc, ingest logic
│   ├── billing/      # Stripe wrappers, plan limits
│   └── shared/       # Types, env validation, logger, error classes
├── package.json      # pnpm workspaces root
└── turbo.json
```

## Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 10 (`corepack enable && corepack prepare pnpm@10.33.0 --activate`)
- **Postgres** (local or Railway-managed)
- **Redis** (local or Railway-managed)

## Setup

```bash
# 1. Install dependencies
pnpm install

# 2. Copy env template and fill in values
cp .env.example .env

# 3. Type-check the workspace
pnpm typecheck
```

## Common scripts

```bash
pnpm dev          # run web + worker concurrently (Turborepo)
pnpm build        # build everything
pnpm typecheck    # tsc --noEmit across workspace
pnpm lint         # biome check
pnpm format       # biome check --write
pnpm test         # run all tests (Vitest)
```

Per-package commands work via Turbo filters, e.g.:

```bash
pnpm --filter @runspend/web dev
pnpm --filter @runspend/ingest dev
```

## Conventions

Read [`CLAUDE.md`](./CLAUDE.md) before contributing. Highlights:

- TypeScript strict, `noUncheckedIndexedAccess`, no `any`.
- Server-first (RSC + server actions). `"use client"` only when needed.
- Octokit only inside `packages/github`. Stripe only inside `packages/billing`.
- Env access only via `packages/shared/env.ts` (zod-validated).
- Money is `numeric`, never `float`.
- All DB writes that touch multiple tables run in `db.transaction()`.
- Conventional Commits, squash-merge.
