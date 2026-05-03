import { type Database, repositories, workflowJobs, workflowRuns, workflows } from "@runspend/db";
import { and, desc, eq, gte, inArray, sql } from "drizzle-orm";

export interface DashboardSummary {
  totalSpendUsd: number;
  totalMinutes: number;
  activeWorkflows: number;
  runCount: number;
}

export interface DailySpendPoint {
  date: string; // ISO yyyy-mm-dd
  costUsd: number;
}

export interface TopWorkflow {
  workflowId: string;
  name: string;
  repoName: string;
  costUsd: number;
  runCount: number;
}

export interface TopRepo {
  repoId: string;
  name: string;
  costUsd: number;
  runCount: number;
}

export interface RunnerOsBreakdown {
  os: string;
  costUsd: number;
}

const ORG_HAS_RUNS = (orgIds: string[]) =>
  orgIds.length === 0 ? sql`false` : inArray(workflowRuns.orgId, orgIds);

function daysAgo(days: number): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getDashboardSummary(
  db: Database,
  orgIds: string[],
  windowDays = 30,
): Promise<DashboardSummary> {
  if (orgIds.length === 0) {
    return { totalSpendUsd: 0, totalMinutes: 0, activeWorkflows: 0, runCount: 0 };
  }
  const since = daysAgo(windowDays);

  const [agg] = await db
    .select({
      totalSpendUsd: sql<string>`coalesce(sum(${workflowRuns.estimatedCostUsd}), 0)`,
      totalMs: sql<string>`coalesce(sum(${workflowRuns.billableDurationMs}), 0)`,
      runCount: sql<number>`count(*)::int`,
    })
    .from(workflowRuns)
    .where(and(ORG_HAS_RUNS(orgIds), gte(workflowRuns.startedAt, since)));

  const [wfAgg] = await db
    .select({
      activeWorkflows: sql<number>`count(distinct ${workflowRuns.workflowId})::int`,
    })
    .from(workflowRuns)
    .where(and(ORG_HAS_RUNS(orgIds), gte(workflowRuns.startedAt, since)));

  return {
    totalSpendUsd: Number(agg?.totalSpendUsd ?? 0),
    totalMinutes: Math.round(Number(agg?.totalMs ?? 0) / 60_000),
    activeWorkflows: wfAgg?.activeWorkflows ?? 0,
    runCount: agg?.runCount ?? 0,
  };
}

export async function getDailySpend(
  db: Database,
  orgIds: string[],
  windowDays = 30,
): Promise<DailySpendPoint[]> {
  if (orgIds.length === 0) return [];
  const since = daysAgo(windowDays - 1);

  const rows = await db
    .select({
      day: sql<string>`to_char(date_trunc('day', ${workflowRuns.startedAt}) at time zone 'UTC', 'YYYY-MM-DD')`,
      costUsd: sql<string>`coalesce(sum(${workflowRuns.estimatedCostUsd}), 0)`,
    })
    .from(workflowRuns)
    .where(and(ORG_HAS_RUNS(orgIds), gte(workflowRuns.startedAt, since)))
    .groupBy(sql`date_trunc('day', ${workflowRuns.startedAt})`)
    .orderBy(sql`date_trunc('day', ${workflowRuns.startedAt})`);

  const byDay = new Map(rows.map((r) => [r.day, Number(r.costUsd)]));
  const out: DailySpendPoint[] = [];
  for (let i = 0; i < windowDays; i++) {
    const d = new Date(since);
    d.setUTCDate(d.getUTCDate() + i);
    const key = d.toISOString().slice(0, 10);
    out.push({ date: key, costUsd: byDay.get(key) ?? 0 });
  }
  return out;
}

export async function getTopWorkflows(
  db: Database,
  orgIds: string[],
  windowDays = 30,
  limit = 10,
): Promise<TopWorkflow[]> {
  if (orgIds.length === 0) return [];
  const since = daysAgo(windowDays);

  const rows = await db
    .select({
      workflowId: workflowRuns.workflowId,
      name: workflows.name,
      repoName: repositories.name,
      costUsd: sql<string>`coalesce(sum(${workflowRuns.estimatedCostUsd}), 0)`,
      runCount: sql<number>`count(*)::int`,
    })
    .from(workflowRuns)
    .innerJoin(workflows, eq(workflows.id, workflowRuns.workflowId))
    .innerJoin(repositories, eq(repositories.id, workflowRuns.repoId))
    .where(and(ORG_HAS_RUNS(orgIds), gte(workflowRuns.startedAt, since)))
    .groupBy(workflowRuns.workflowId, workflows.name, repositories.name)
    .orderBy(desc(sql`coalesce(sum(${workflowRuns.estimatedCostUsd}), 0)`))
    .limit(limit);

  return rows.map((r) => ({
    workflowId: r.workflowId,
    name: r.name,
    repoName: r.repoName,
    costUsd: Number(r.costUsd),
    runCount: r.runCount,
  }));
}

export async function getTopRepos(
  db: Database,
  orgIds: string[],
  windowDays = 30,
  limit = 10,
): Promise<TopRepo[]> {
  if (orgIds.length === 0) return [];
  const since = daysAgo(windowDays);

  const rows = await db
    .select({
      repoId: workflowRuns.repoId,
      name: repositories.name,
      costUsd: sql<string>`coalesce(sum(${workflowRuns.estimatedCostUsd}), 0)`,
      runCount: sql<number>`count(*)::int`,
    })
    .from(workflowRuns)
    .innerJoin(repositories, eq(repositories.id, workflowRuns.repoId))
    .where(and(ORG_HAS_RUNS(orgIds), gte(workflowRuns.startedAt, since)))
    .groupBy(workflowRuns.repoId, repositories.name)
    .orderBy(desc(sql`coalesce(sum(${workflowRuns.estimatedCostUsd}), 0)`))
    .limit(limit);

  return rows.map((r) => ({
    repoId: r.repoId,
    name: r.name,
    costUsd: Number(r.costUsd),
    runCount: r.runCount,
  }));
}

export async function getRunnerOsBreakdown(
  db: Database,
  orgIds: string[],
  windowDays = 30,
): Promise<RunnerOsBreakdown[]> {
  if (orgIds.length === 0) return [];
  const since = daysAgo(windowDays);

  const rows = await db
    .select({
      os: workflowJobs.runnerOs,
      costUsd: sql<string>`coalesce(sum(${workflowJobs.estimatedCostUsd}), 0)`,
    })
    .from(workflowJobs)
    .where(and(inArray(workflowJobs.orgId, orgIds), gte(workflowJobs.startedAt, since)))
    .groupBy(workflowJobs.runnerOs)
    .orderBy(desc(sql`coalesce(sum(${workflowJobs.estimatedCostUsd}), 0)`));

  return rows.map((r) => ({ os: r.os, costUsd: Number(r.costUsd) }));
}

export interface WorkflowRunRow {
  id: string;
  githubRunId: string;
  runNumber: number;
  status: string;
  conclusion: string | null;
  headBranch: string | null;
  actorLogin: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  durationMs: number | null;
  costUsd: number;
}

export interface WorkflowDetail {
  workflowId: string;
  name: string;
  path: string;
  repoName: string;
  orgId: string;
}

export async function getWorkflowDetail(
  db: Database,
  workflowId: string,
  orgIds: string[],
): Promise<WorkflowDetail | null> {
  if (orgIds.length === 0) return null;
  const [row] = await db
    .select({
      workflowId: workflows.id,
      name: workflows.name,
      path: workflows.path,
      repoName: repositories.name,
      orgId: repositories.orgId,
    })
    .from(workflows)
    .innerJoin(repositories, eq(repositories.id, workflows.repoId))
    .where(and(eq(workflows.id, workflowId), inArray(repositories.orgId, orgIds)))
    .limit(1);
  return row ?? null;
}

export async function getWorkflowRuns(
  db: Database,
  workflowId: string,
  orgIds: string[],
  limit = 100,
): Promise<WorkflowRunRow[]> {
  if (orgIds.length === 0) return [];
  const rows = await db
    .select({
      id: workflowRuns.id,
      githubRunId: workflowRuns.githubRunId,
      runNumber: workflowRuns.runNumber,
      status: workflowRuns.status,
      conclusion: workflowRuns.conclusion,
      headBranch: workflowRuns.headBranch,
      actorLogin: workflowRuns.actorLogin,
      startedAt: workflowRuns.startedAt,
      completedAt: workflowRuns.completedAt,
      durationMs: workflowRuns.totalDurationMs,
      costUsd: workflowRuns.estimatedCostUsd,
    })
    .from(workflowRuns)
    .where(and(eq(workflowRuns.workflowId, workflowId), inArray(workflowRuns.orgId, orgIds)))
    .orderBy(desc(workflowRuns.startedAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    githubRunId: String(r.githubRunId),
    runNumber: r.runNumber,
    status: r.status,
    conclusion: r.conclusion,
    headBranch: r.headBranch,
    actorLogin: r.actorLogin,
    startedAt: r.startedAt,
    completedAt: r.completedAt,
    durationMs: r.durationMs,
    costUsd: Number(r.costUsd ?? 0),
  }));
}
