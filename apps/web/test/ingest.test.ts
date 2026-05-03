import { randomUUID } from "node:crypto";
import {
  createDb,
  type Database,
  organizations,
  repositories,
  workflowJobs,
  workflowRuns,
  workflows,
} from "@runspend/db";
import { runMigrations } from "@runspend/db/migrate";
import {
  classifyRunner,
  ingestRun,
  loadRunnerRates,
  type ParsedWorkflowJob,
  type ParsedWorkflowRun,
} from "@runspend/github";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("classifyRunner", () => {
  it("treats labels containing self-hosted as self-hosted", () => {
    expect(
      classifyRunner({ labels: ["self-hosted", "linux", "x64"], runnerGroupName: "Default" }),
    ).toEqual({ os: "self-hosted", label: "linux", size: null });
  });

  it("classifies ubuntu-latest as ubuntu with no size", () => {
    expect(
      classifyRunner({ labels: ["ubuntu-latest"], runnerGroupName: "GitHub Actions" }),
    ).toEqual({ os: "ubuntu", label: "ubuntu-latest", size: null });
  });

  it("classifies windows-2022 as windows with no size", () => {
    expect(classifyRunner({ labels: ["windows-2022"], runnerGroupName: "GitHub Actions" })).toEqual(
      { os: "windows", label: "windows-2022", size: null },
    );
  });

  it("extracts a size from larger-runner labels", () => {
    expect(
      classifyRunner({ labels: ["ubuntu-22.04-4-core"], runnerGroupName: "GitHub Actions" }),
    ).toEqual({ os: "ubuntu", label: "ubuntu-22.04-4-core", size: "4-core" });
  });

  it("extracts xlarge from macos-14-xlarge", () => {
    expect(
      classifyRunner({ labels: ["macos-14-xlarge"], runnerGroupName: "GitHub Actions" }),
    ).toEqual({ os: "macos", label: "macos-14-xlarge", size: "xlarge" });
  });

  it("treats unknown runner_group_name as self-hosted", () => {
    expect(classifyRunner({ labels: ["custom-runner"], runnerGroupName: "Internal Pool" })).toEqual(
      { os: "self-hosted", label: "custom-runner", size: null },
    );
  });

  it("falls back to self-hosted when no OS label is recognizable", () => {
    expect(classifyRunner({ labels: ["weird"], runnerGroupName: "GitHub Actions" })).toEqual({
      os: "self-hosted",
      label: "weird",
      size: null,
    });
  });
});

const baseUrl = process.env.TEST_DATABASE_URL;
const describeIfDb = baseUrl ? describe : describe.skip;

describeIfDb("ingestRun (DB-backed, idempotency)", () => {
  let adminClient: ReturnType<typeof postgres> | undefined;
  let testDbName: string;
  let db: Database;
  let orgId: string;
  let repoId: string;
  let workflowRowId: string;

  beforeAll(async () => {
    if (!baseUrl) return;
    testDbName = `runspend_ingest_${randomUUID().replace(/-/g, "")}`;
    adminClient = postgres(baseUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${testDbName}"`);
    const url = new URL(baseUrl);
    url.pathname = `/${testDbName}`;
    await runMigrations(url.toString());
    db = createDb(url.toString());

    const [org] = await db
      .insert(organizations)
      .values({
        githubOrgId: 1n,
        githubLogin: "acme",
        installationId: 1000n,
        plan: "trial",
      })
      .returning({ id: organizations.id });
    if (!org) throw new Error("test setup: org insert failed");
    orgId = org.id;

    const [repo] = await db
      .insert(repositories)
      .values({
        orgId,
        githubRepoId: 42n,
        name: "widgets",
        defaultBranch: "main",
        isPrivate: true,
        active: true,
      })
      .returning({ id: repositories.id });
    if (!repo) throw new Error("test setup: repo insert failed");
    repoId = repo.id;

    const [wf] = await db
      .insert(workflows)
      .values({
        repoId,
        githubWorkflowId: 7n,
        name: "ci",
        path: ".github/workflows/ci.yml",
        state: "active",
      })
      .returning({ id: workflows.id });
    if (!wf) throw new Error("test setup: workflow insert failed");
    workflowRowId = wf.id;
  });

  afterAll(async () => {
    if (!adminClient || !testDbName) return;
    await adminClient.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${testDbName}' AND pid <> pg_backend_pid()`,
    );
    await adminClient.unsafe(`DROP DATABASE IF EXISTS "${testDbName}"`);
    await adminClient.end({ timeout: 5 });
  });

  it("upserts run + jobs and is idempotent on re-run", async () => {
    const run: ParsedWorkflowRun = {
      githubRunId: 12345n,
      githubWorkflowId: 7n,
      runNumber: 1,
      event: "push",
      status: "completed",
      conclusion: "success",
      headBranch: "main",
      headSha: "abc123",
      actorLogin: "octocat",
      startedAt: new Date("2025-01-01T00:00:00Z"),
      completedAt: new Date("2025-01-01T00:05:00Z"),
    };
    const jobs: ParsedWorkflowJob[] = [
      {
        githubJobId: 9001n,
        githubRunId: 12345n,
        name: "build",
        status: "completed",
        conclusion: "success",
        runnerOs: "ubuntu",
        runnerLabel: "ubuntu-latest",
        runnerSize: null,
        startedAt: new Date("2025-01-01T00:00:30Z"),
        completedAt: new Date("2025-01-01T00:03:00Z"),
      },
      {
        githubJobId: 9002n,
        githubRunId: 12345n,
        name: "test",
        status: "completed",
        conclusion: "success",
        runnerOs: "ubuntu",
        runnerLabel: "ubuntu-latest",
        runnerSize: null,
        startedAt: new Date("2025-01-01T00:03:00Z"),
        completedAt: new Date("2025-01-01T00:04:30Z"),
      },
    ];

    const rates = await loadRunnerRates(db);
    // octokit unused in this path because jobs+workflowRowId are pre-supplied.
    const fakeOctokit = {} as Parameters<typeof ingestRun>[0]["octokit"];

    const r1 = await ingestRun(
      { db, octokit: fakeOctokit, rates },
      {
        context: {
          orgId,
          repoId,
          installationId: 1000n,
          coord: { owner: "acme", repo: "widgets" },
        },
        run,
        jobs,
        workflowRowId,
      },
    );
    expect(r1.jobCount).toBe(2);
    expect(r1.unpricedJobCount).toBe(0);

    const runRows = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.githubRunId, 12345n));
    expect(runRows).toHaveLength(1);
    const stored = runRows[0];
    if (!stored) throw new Error("expected run row");
    // 2.5min + 1.5min, each rounded up per job → 3 + 2 = 5 minutes billable.
    expect(stored.billableDurationMs).toBe(5 * 60_000);
    expect(stored.estimatedCostUsd).toBe("0.0400");

    const jobRows = await db.select().from(workflowJobs).where(eq(workflowJobs.runId, r1.runRowId));
    expect(jobRows).toHaveLength(2);

    // Re-run identical input. Idempotency: same row count, run row id stable.
    const r2 = await ingestRun(
      { db, octokit: fakeOctokit, rates },
      {
        context: {
          orgId,
          repoId,
          installationId: 1000n,
          coord: { owner: "acme", repo: "widgets" },
        },
        run,
        jobs,
        workflowRowId,
      },
    );
    expect(r2.runRowId).toBe(r1.runRowId);
    const runRows2 = await db
      .select()
      .from(workflowRuns)
      .where(eq(workflowRuns.githubRunId, 12345n));
    expect(runRows2).toHaveLength(1);
    const jobRows2 = await db
      .select()
      .from(workflowJobs)
      .where(eq(workflowJobs.runId, r1.runRowId));
    expect(jobRows2).toHaveLength(2);
  });

  it("flags unpriced jobs without crashing", async () => {
    const run: ParsedWorkflowRun = {
      githubRunId: 99999n,
      githubWorkflowId: 7n,
      runNumber: 2,
      event: "push",
      status: "completed",
      conclusion: "success",
      headBranch: "main",
      headSha: "def456",
      actorLogin: "octocat",
      startedAt: new Date("2025-01-02T00:00:00Z"),
      completedAt: new Date("2025-01-02T00:01:00Z"),
    };
    const jobs: ParsedWorkflowJob[] = [
      {
        githubJobId: 9999n,
        githubRunId: 99999n,
        name: "weird",
        status: "completed",
        conclusion: "success",
        // OS the rate table doesn't price for this label, and we override
        // loadRunnerRates with a stub that returns undefined.
        runnerOs: "ubuntu",
        runnerLabel: "ubuntu-latest",
        runnerSize: null,
        startedAt: new Date("2025-01-02T00:00:00Z"),
        completedAt: new Date("2025-01-02T00:00:30Z"),
      },
    ];
    const noRates = () => undefined;
    const fakeOctokit = {} as Parameters<typeof ingestRun>[0]["octokit"];

    const r = await ingestRun(
      { db, octokit: fakeOctokit, rates: noRates },
      {
        context: {
          orgId,
          repoId,
          installationId: 1000n,
          coord: { owner: "acme", repo: "widgets" },
        },
        run,
        jobs,
        workflowRowId,
      },
    );
    expect(r.jobCount).toBe(1);
    expect(r.unpricedJobCount).toBe(1);

    const stored = await db.select().from(workflowRuns).where(eq(workflowRuns.githubRunId, 99999n));
    expect(stored).toHaveLength(1);
    expect(stored[0]?.estimatedCostUsd).toBe("0.0000");
  });
});
