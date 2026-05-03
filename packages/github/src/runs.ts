import type { Octokit } from "@octokit/core";
import { type GithubAppConfig, getInstallationOctokit } from "./app";

export type RunnerOsClass = "ubuntu" | "windows" | "macos" | "self-hosted";

export interface ParsedWorkflowRun {
  githubRunId: bigint;
  githubWorkflowId: bigint;
  runNumber: number;
  event: string;
  status: string;
  conclusion: string | null;
  headBranch: string | null;
  headSha: string | null;
  actorLogin: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ParsedWorkflowJob {
  githubJobId: bigint;
  githubRunId: bigint;
  name: string;
  status: string;
  conclusion: string | null;
  runnerOs: RunnerOsClass;
  runnerLabel: string | null;
  runnerSize: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
}

export interface ParsedWorkflow {
  githubWorkflowId: bigint;
  name: string;
  path: string;
  state: WorkflowState;
}

export type WorkflowState =
  | "active"
  | "deleted"
  | "disabled_fork"
  | "disabled_inactivity"
  | "disabled_manually";

const WORKFLOW_STATES: ReadonlySet<WorkflowState> = new Set([
  "active",
  "deleted",
  "disabled_fork",
  "disabled_inactivity",
  "disabled_manually",
]);

function parseDate(raw: unknown): Date | null {
  if (typeof raw !== "string" || raw.length === 0) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function parseBigInt(raw: unknown, field: string): bigint {
  if (typeof raw === "number" || typeof raw === "string") return BigInt(raw);
  throw new Error(`${field}: expected number or string, got ${typeof raw}`);
}

function parseString(raw: unknown, field: string): string {
  if (typeof raw !== "string") throw new Error(`${field}: expected string, got ${typeof raw}`);
  return raw;
}

function parseOptionalString(raw: unknown): string | null {
  return typeof raw === "string" && raw.length > 0 ? raw : null;
}

/**
 * Classify a job's runner from its labels + runner group. GitHub's payload
 * doesn't expose runner_os directly — we derive it from the labels array,
 * with `self-hosted` taking precedence over OS-family detection.
 *
 * Hosted-runner labels GitHub emits: `ubuntu-latest`, `ubuntu-22.04`,
 * `ubuntu-22.04-4-core`, `windows-latest`, `windows-2022`, `macos-14`,
 * `macos-14-xlarge`, etc. Self-hosted runners always include the literal
 * label `self-hosted`.
 */
export function classifyRunner(input: {
  labels: readonly string[];
  runnerGroupName?: string | null;
}): { os: RunnerOsClass; label: string | null; size: string | null } {
  const labels = input.labels.map((l) => l.toLowerCase());
  const isSelfHosted =
    labels.includes("self-hosted") ||
    (input.runnerGroupName !== null &&
      input.runnerGroupName !== undefined &&
      input.runnerGroupName !== "GitHub Actions" &&
      input.runnerGroupName !== "");

  if (isSelfHosted) {
    return {
      os: "self-hosted",
      label: input.labels.find((l) => l.toLowerCase() !== "self-hosted") ?? null,
      size: null,
    };
  }

  const osLabel = labels.find(
    (l) => l.startsWith("ubuntu") || l.startsWith("windows") || l.startsWith("macos"),
  );
  if (!osLabel) {
    // Hosted runner with unrecognized label — treat as self-hosted so we
    // don't accidentally bill at a hosted rate. Caller will see cost=0.
    return { os: "self-hosted", label: input.labels[0] ?? null, size: null };
  }

  const os: RunnerOsClass = osLabel.startsWith("ubuntu")
    ? "ubuntu"
    : osLabel.startsWith("windows")
      ? "windows"
      : "macos";

  // Larger-runner labels follow the pattern `<os>-<version>-<N>-core` or
  // `<os>-<version>-<size>` (e.g. ubuntu-22.04-xlarge). Capture everything
  // after the os/version pair as `size`.
  const sizeMatch = osLabel.match(/^(ubuntu|windows|macos)(?:-[^-]+)?-(.+)$/);
  const size = sizeMatch?.[2] ?? null;
  // Don't treat plain version suffixes (e.g. `latest`, `22.04`) as a size.
  const isVersionSuffix = size !== null && /^[\d.]+$|^latest$/.test(size);

  return {
    os,
    label: osLabel,
    size: isVersionSuffix ? null : size,
  };
}

function parseWorkflowRun(raw: unknown): ParsedWorkflowRun {
  if (!raw || typeof raw !== "object") throw new Error("workflow_run payload missing");
  const r = raw as Record<string, unknown>;
  const actor = r.actor as Record<string, unknown> | null | undefined;
  return {
    githubRunId: parseBigInt(r.id, "workflow_run.id"),
    githubWorkflowId: parseBigInt(r.workflow_id, "workflow_run.workflow_id"),
    runNumber: typeof r.run_number === "number" ? r.run_number : 0,
    event: parseString(r.event, "workflow_run.event"),
    status: parseString(r.status, "workflow_run.status"),
    conclusion: parseOptionalString(r.conclusion),
    headBranch: parseOptionalString(r.head_branch),
    headSha: parseOptionalString(r.head_sha),
    actorLogin: parseOptionalString(actor?.login),
    // run_started_at is the actual run start; created_at can be earlier
    // (queued time). Fall back to created_at if unavailable on older runs.
    startedAt: parseDate(r.run_started_at) ?? parseDate(r.created_at),
    completedAt: parseDate(r.updated_at),
  };
}

function parseWorkflowJob(raw: unknown): ParsedWorkflowJob {
  if (!raw || typeof raw !== "object") throw new Error("workflow_job payload missing");
  const j = raw as Record<string, unknown>;
  const labels = Array.isArray(j.labels)
    ? j.labels.filter((l): l is string => typeof l === "string")
    : [];
  const runner = classifyRunner({
    labels,
    runnerGroupName: parseOptionalString(j.runner_group_name),
  });
  return {
    githubJobId: parseBigInt(j.id, "workflow_job.id"),
    githubRunId: parseBigInt(j.run_id, "workflow_job.run_id"),
    name: parseString(j.name, "workflow_job.name"),
    status: parseString(j.status, "workflow_job.status"),
    conclusion: parseOptionalString(j.conclusion),
    runnerOs: runner.os,
    runnerLabel: runner.label,
    runnerSize: runner.size,
    startedAt: parseDate(j.started_at),
    completedAt: parseDate(j.completed_at),
  };
}

function parseWorkflow(raw: unknown): ParsedWorkflow {
  if (!raw || typeof raw !== "object") throw new Error("workflow payload missing");
  const w = raw as Record<string, unknown>;
  const stateRaw = parseString(w.state, "workflow.state");
  const state: WorkflowState = WORKFLOW_STATES.has(stateRaw as WorkflowState)
    ? (stateRaw as WorkflowState)
    : "active";
  return {
    githubWorkflowId: parseBigInt(w.id, "workflow.id"),
    name: parseString(w.name, "workflow.name"),
    path: parseString(w.path, "workflow.path"),
    state,
  };
}

export interface RepoCoordinate {
  owner: string;
  repo: string;
}

export interface ListWorkflowRunsOptions {
  /** ISO-8601 lower bound. Translated to GitHub's `created=>=<iso>` filter. */
  since?: string;
  perPage?: number;
  /** Stop after this many runs (pagination cap, e.g. backfill safety net). */
  maxRuns?: number;
}

/**
 * Page through `/repos/{owner}/{repo}/actions/runs` returning parsed runs
 * newest-first. Honors `since` via GitHub's `created` query, which uses the
 * same comparators as search syntax.
 */
export async function listWorkflowRuns(
  octokit: Octokit,
  coord: RepoCoordinate,
  opts: ListWorkflowRunsOptions = {},
): Promise<ParsedWorkflowRun[]> {
  const perPage = opts.perPage ?? 100;
  const out: ParsedWorkflowRun[] = [];
  let page = 1;
  while (true) {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/actions/runs", {
      owner: coord.owner,
      repo: coord.repo,
      per_page: perPage,
      page,
      ...(opts.since ? { created: `>=${opts.since}` } : {}),
    });
    const runs = Array.isArray((data as { workflow_runs?: unknown[] }).workflow_runs)
      ? ((data as { workflow_runs: unknown[] }).workflow_runs as unknown[])
      : [];
    for (const r of runs) out.push(parseWorkflowRun(r));
    if (runs.length < perPage) break;
    if (opts.maxRuns !== undefined && out.length >= opts.maxRuns) break;
    page += 1;
  }
  return opts.maxRuns !== undefined ? out.slice(0, opts.maxRuns) : out;
}

/** Page through jobs for a single run. */
export async function listRunJobs(
  octokit: Octokit,
  coord: RepoCoordinate,
  githubRunId: bigint,
): Promise<ParsedWorkflowJob[]> {
  const out: ParsedWorkflowJob[] = [];
  let page = 1;
  const perPage = 100;
  while (true) {
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/actions/runs/{run_id}/jobs", {
      owner: coord.owner,
      repo: coord.repo,
      run_id: Number(githubRunId),
      per_page: perPage,
      page,
      filter: "all",
    });
    const jobs = Array.isArray((data as { jobs?: unknown[] }).jobs)
      ? ((data as { jobs: unknown[] }).jobs as unknown[])
      : [];
    for (const j of jobs) out.push(parseWorkflowJob(j));
    if (jobs.length < perPage) break;
    page += 1;
  }
  return out;
}

export async function fetchRun(
  octokit: Octokit,
  coord: RepoCoordinate,
  githubRunId: bigint,
): Promise<ParsedWorkflowRun> {
  const { data } = await octokit.request("GET /repos/{owner}/{repo}/actions/runs/{run_id}", {
    owner: coord.owner,
    repo: coord.repo,
    run_id: Number(githubRunId),
  });
  return parseWorkflowRun(data);
}

export async function fetchWorkflow(
  octokit: Octokit,
  coord: RepoCoordinate,
  githubWorkflowId: bigint,
): Promise<ParsedWorkflow> {
  const { data } = await octokit.request(
    "GET /repos/{owner}/{repo}/actions/workflows/{workflow_id}",
    {
      owner: coord.owner,
      repo: coord.repo,
      workflow_id: Number(githubWorkflowId),
    },
  );
  return parseWorkflow(data);
}

/** Convenience: get a per-installation octokit for use across ingest calls. */
export async function getOctokitForInstallation(
  config: GithubAppConfig,
  installationId: bigint,
): Promise<Octokit> {
  return getInstallationOctokit(config, Number(installationId));
}

export { parseWorkflow, parseWorkflowJob, parseWorkflowRun };
