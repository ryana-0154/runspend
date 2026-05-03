import {
  type Database,
  organizations,
  repositories,
  workflowJobs,
  workflowRuns,
  workflows,
} from "@runspend/db";
import { and, eq, sql } from "drizzle-orm";
import type { GithubAppConfig } from "./app";
import {
  formatCostUsd,
  type JobCostResult,
  jobCost,
  loadRunnerRates,
  type RunnerRateLookup,
  sumRunCost,
} from "./pricing";
import {
  fetchRun,
  fetchWorkflow,
  getOctokitForInstallation,
  listRunJobs,
  listWorkflowRuns,
  type ParsedWorkflowJob,
  type ParsedWorkflowRun,
  type RepoCoordinate,
} from "./runs";

const DEFAULT_BACKFILL_DAYS = 30;

export interface IngestContext {
  orgId: string;
  repoId: string;
  installationId: bigint;
  coord: RepoCoordinate;
}

/**
 * Resolve the per-repo data the worker needs to talk to GitHub: the
 * installation_id (for app auth) plus owner/repo for the API path.
 */
export async function loadIngestContext(
  db: Database,
  repoId: string,
): Promise<IngestContext | null> {
  const [row] = await db
    .select({
      orgId: repositories.orgId,
      repoId: repositories.id,
      repoName: repositories.name,
      installationId: organizations.installationId,
      ownerLogin: organizations.githubLogin,
    })
    .from(repositories)
    .innerJoin(organizations, eq(organizations.id, repositories.orgId))
    .where(eq(repositories.id, repoId))
    .limit(1);
  if (!row) return null;
  return {
    orgId: row.orgId,
    repoId: row.repoId,
    installationId: row.installationId,
    coord: { owner: row.ownerLogin, repo: row.repoName },
  };
}

export interface UpsertWorkflowInput {
  repoId: string;
  workflow: {
    githubWorkflowId: bigint;
    name: string;
    path: string;
    state: "active" | "deleted" | "disabled_fork" | "disabled_inactivity" | "disabled_manually";
  };
}

/** Idempotent upsert keyed on github_workflow_id. Returns the row id. */
export async function upsertWorkflow(db: Database, input: UpsertWorkflowInput): Promise<string> {
  const [row] = await db
    .insert(workflows)
    .values({
      repoId: input.repoId,
      githubWorkflowId: input.workflow.githubWorkflowId,
      name: input.workflow.name,
      path: input.workflow.path,
      state: input.workflow.state,
    })
    .onConflictDoUpdate({
      target: workflows.githubWorkflowId,
      set: {
        name: input.workflow.name,
        path: input.workflow.path,
        state: input.workflow.state,
      },
    })
    .returning({ id: workflows.id });
  if (!row) throw new Error("upsertWorkflow: no row returned");
  return row.id;
}

function durationMs(start: Date | null, end: Date | null): number | null {
  if (!start || !end) return null;
  const ms = end.getTime() - start.getTime();
  return ms < 0 ? 0 : ms;
}

interface IngestRunDeps {
  db: Database;
  octokit: import("@octokit/core").Octokit;
  rates: RunnerRateLookup;
}

interface IngestRunArgs {
  context: IngestContext;
  run: ParsedWorkflowRun;
  /** Pre-fetched jobs (tests/webhook fast path); fetched if omitted. */
  jobs?: ParsedWorkflowJob[];
  /** Pre-fetched workflow row id, to avoid an upsert when batching. */
  workflowRowId?: string;
}

/**
 * Persist a single run + its jobs. Idempotent — safe to re-run for the same
 * githubRunId. Returns the cost summary so callers can batch-update
 * `repositories.last_ingested_run_id` etc.
 */
export async function ingestRun(
  deps: IngestRunDeps,
  args: IngestRunArgs,
): Promise<{
  runRowId: string;
  workflowRowId: string;
  jobCount: number;
  unpricedJobCount: number;
}> {
  const { db, octokit, rates } = deps;
  const { context, run } = args;

  const jobs = args.jobs ?? (await listRunJobs(octokit, context.coord, run.githubRunId));

  const workflowRowId =
    args.workflowRowId ?? (await ensureWorkflowRow(db, octokit, context, run.githubWorkflowId));

  // Compute per-job costs first so we can sum into the run row.
  const jobCosts: Array<{ job: ParsedWorkflowJob; cost: JobCostResult | null; ms: number | null }> =
    jobs.map((job) => {
      const ms = durationMs(job.startedAt, job.completedAt);
      const cost =
        ms === null
          ? null
          : jobCost(
              { runnerOs: job.runnerOs, runnerLabel: job.runnerLabel, billableDurationMs: ms },
              rates,
            );
      return { job, cost, ms };
    });

  const billableMs = jobCosts.reduce(
    (acc, j) => acc + (j.cost ? j.cost.billableMinutes * 60_000 : 0),
    0,
  );
  const totalCost = sumRunCost(jobCosts.flatMap((j) => (j.cost ? [j.cost] : [])));
  const unpricedJobCount = jobCosts.filter((j) => j.ms !== null && j.cost === null).length;

  const totalDurationMs = durationMs(run.startedAt, run.completedAt);
  const estimatedCostUsd = jobCosts.length > 0 ? formatCostUsd(totalCost) : null;

  const runRowId = await db.transaction(async (tx) => {
    const [runRow] = await tx
      .insert(workflowRuns)
      .values({
        workflowId: workflowRowId,
        repoId: context.repoId,
        orgId: context.orgId,
        githubRunId: run.githubRunId,
        runNumber: run.runNumber,
        event: run.event,
        status: run.status,
        conclusion: run.conclusion,
        headBranch: run.headBranch,
        headSha: run.headSha,
        actorLogin: run.actorLogin,
        startedAt: run.startedAt,
        completedAt: run.completedAt,
        totalDurationMs,
        billableDurationMs: billableMs,
        estimatedCostUsd,
      })
      .onConflictDoUpdate({
        target: workflowRuns.githubRunId,
        set: {
          status: run.status,
          conclusion: run.conclusion,
          startedAt: run.startedAt,
          completedAt: run.completedAt,
          totalDurationMs,
          billableDurationMs: billableMs,
          estimatedCostUsd,
        },
      })
      .returning({ id: workflowRuns.id });
    if (!runRow) throw new Error("ingestRun: workflow_runs upsert returned no row");

    for (const { job, cost, ms } of jobCosts) {
      const jobCostUsd = cost ? formatCostUsd(cost.costUsd) : null;
      await tx
        .insert(workflowJobs)
        .values({
          runId: runRow.id,
          orgId: context.orgId,
          githubJobId: job.githubJobId,
          name: job.name,
          status: job.status,
          conclusion: job.conclusion,
          runnerOs: job.runnerOs,
          runnerLabel: job.runnerLabel,
          runnerSize: job.runnerSize,
          startedAt: job.startedAt,
          completedAt: job.completedAt,
          billableDurationMs: ms,
          estimatedCostUsd: jobCostUsd,
        })
        .onConflictDoUpdate({
          target: workflowJobs.githubJobId,
          set: {
            status: job.status,
            conclusion: job.conclusion,
            runnerOs: job.runnerOs,
            runnerLabel: job.runnerLabel,
            runnerSize: job.runnerSize,
            startedAt: job.startedAt,
            completedAt: job.completedAt,
            billableDurationMs: ms,
            estimatedCostUsd: jobCostUsd,
          },
        });
    }
    return runRow.id;
  });

  return {
    runRowId,
    workflowRowId,
    jobCount: jobs.length,
    unpricedJobCount,
  };
}

const workflowRowCache = new Map<string, string>();

async function ensureWorkflowRow(
  db: Database,
  octokit: import("@octokit/core").Octokit,
  context: IngestContext,
  githubWorkflowId: bigint,
): Promise<string> {
  const cacheKey = `${context.repoId}:${githubWorkflowId}`;
  const cached = workflowRowCache.get(cacheKey);
  if (cached) return cached;

  // Try existing row first to avoid a network call on the hot path.
  const [existing] = await db
    .select({ id: workflows.id })
    .from(workflows)
    .where(
      and(eq(workflows.repoId, context.repoId), eq(workflows.githubWorkflowId, githubWorkflowId)),
    )
    .limit(1);
  if (existing) {
    workflowRowCache.set(cacheKey, existing.id);
    return existing.id;
  }

  const wf = await fetchWorkflow(octokit, context.coord, githubWorkflowId);
  const id = await upsertWorkflow(db, { repoId: context.repoId, workflow: wf });
  workflowRowCache.set(cacheKey, id);
  return id;
}

async function bumpLastIngestedRunId(
  db: Database,
  repoId: string,
  githubRunId: bigint,
): Promise<void> {
  await db
    .update(repositories)
    .set({
      lastIngestedRunId: sql`GREATEST(COALESCE(${repositories.lastIngestedRunId}, 0), ${githubRunId})`,
    })
    .where(eq(repositories.id, repoId));
}

export interface IngestSingleRunPayload {
  orgId: string;
  repoId: string;
  githubRunId: string;
}

/** Webhook fast-path: ingest exactly one run by id. */
export async function ingestSingleRun(
  config: GithubAppConfig,
  db: Database,
  payload: IngestSingleRunPayload,
): Promise<{ ingested: boolean; runRowId?: string }> {
  const context = await loadIngestContext(db, payload.repoId);
  if (!context) return { ingested: false };

  const octokit = await getOctokitForInstallation(config, context.installationId);
  const rates = await loadRunnerRates(db);
  const run = await fetchRun(octokit, context.coord, BigInt(payload.githubRunId));
  const result = await ingestRun({ db, octokit, rates }, { context, run });
  await bumpLastIngestedRunId(db, context.repoId, run.githubRunId);
  return { ingested: true, runRowId: result.runRowId };
}

export interface IngestRunsSincePayload {
  orgId: string;
  repoId: string;
  /** ISO-8601 lower bound. Defaults to last 30 days for backfill. */
  since?: string;
  /** Cap pagination — keeps backfill predictable on large repos. */
  maxRuns?: number;
}

/**
 * Used by both backfill (with `since` set to N days ago) and incremental
 * (with `since` derived from `last_ingested_run`'s completed_at). Pages
 * through runs newest-first and ingests each.
 */
export async function ingestRunsSince(
  config: GithubAppConfig,
  db: Database,
  payload: IngestRunsSincePayload,
): Promise<{ runsIngested: number; jobsIngested: number; unpricedJobs: number }> {
  const context = await loadIngestContext(db, payload.repoId);
  if (!context) return { runsIngested: 0, jobsIngested: 0, unpricedJobs: 0 };

  const since =
    payload.since ?? new Date(Date.now() - DEFAULT_BACKFILL_DAYS * 86_400_000).toISOString();

  const octokit = await getOctokitForInstallation(config, context.installationId);
  const rates = await loadRunnerRates(db);
  const runs = await listWorkflowRuns(octokit, context.coord, {
    since,
    maxRuns: payload.maxRuns,
  });

  let jobsIngested = 0;
  let unpricedJobs = 0;
  let highestRunId = 0n;
  for (const run of runs) {
    const result = await ingestRun({ db, octokit, rates }, { context, run });
    jobsIngested += result.jobCount;
    unpricedJobs += result.unpricedJobCount;
    if (run.githubRunId > highestRunId) highestRunId = run.githubRunId;
  }

  if (highestRunId > 0n) {
    await bumpLastIngestedRunId(db, context.repoId, highestRunId);
  }

  return { runsIngested: runs.length, jobsIngested, unpricedJobs };
}

/** Used by the hourly incremental queue — derives `since` from the repo's prior cursor. */
export async function ingestIncremental(
  config: GithubAppConfig,
  db: Database,
  payload: { orgId: string; repoId: string },
): Promise<{ runsIngested: number; jobsIngested: number; unpricedJobs: number }> {
  // We could read `last_ingested_run_id` and look up its completed_at, but
  // GitHub's `created` filter wants a date, not an id. Cheaper: re-window
  // the last 2 hours and rely on idempotency to dedupe. The hourly cadence
  // means at most 2x the work in the steady state — worth the simpler code.
  const since = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
  return ingestRunsSince(config, db, { ...payload, since });
}
