import { randomUUID } from "node:crypto";
import {
  createDb,
  type Database,
  organizations,
  orgMemberships,
  repositories,
  users,
} from "@runspend/db";
import { runMigrations } from "@runspend/db/migrate";
import type { GithubInstallation, GithubRepositoryRef } from "@runspend/github";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { upsertUserFromGithub } from "@/lib/auth/upsert-user";
import { completeInstall } from "@/lib/github/install-flow";
import { handleWebhook } from "@/lib/github/webhook-handlers";

const baseUrl = process.env.TEST_DATABASE_URL;
const describeIfDb = baseUrl ? describe : describe.skip;

let adminClient: ReturnType<typeof postgres> | undefined;
let testDbName: string | undefined;
let db: Database;

beforeAll(async () => {
  if (!baseUrl) return;
  testDbName = `runspend_install_${randomUUID().replace(/-/g, "")}`;
  adminClient = postgres(baseUrl, { max: 1 });
  await adminClient.unsafe(`CREATE DATABASE "${testDbName}"`);
  const url = new URL(baseUrl);
  url.pathname = `/${testDbName}`;
  await runMigrations(url.toString());
  db = createDb(url.toString());
});

afterAll(async () => {
  if (!adminClient || !testDbName) return;
  await adminClient.unsafe(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${testDbName}' AND pid <> pg_backend_pid()`,
  );
  await adminClient.unsafe(`DROP DATABASE IF EXISTS "${testDbName}"`);
  await adminClient.end({ timeout: 5 });
});

const fakeAppConfig = { appId: "1", privateKey: "unused-in-tests" };

function makeInstallation(overrides: Partial<GithubInstallation> = {}): GithubInstallation {
  return {
    id: 555_111n,
    account: { id: 999n, login: "acme-co", type: "Organization" },
    ...overrides,
  };
}

function makeRepo(id: bigint, name: string): GithubRepositoryRef {
  return {
    id,
    name,
    fullName: `acme-co/${name}`,
    defaultBranch: "main",
    isPrivate: false,
  };
}

describeIfDb("GitHub App install flow", () => {
  it("creates org, owner membership, and repos on first install", async () => {
    const user = await upsertUserFromGithub(db, {
      githubUserId: 10001n,
      email: "owner@acme.example",
      name: "Owner",
      avatarUrl: null,
    });

    const installation = makeInstallation();
    const repos = [makeRepo(7001n, "monolith"), makeRepo(7002n, "infra")];

    const result = await completeInstall(
      db,
      fakeAppConfig,
      { installationId: 555_111, userId: user.id },
      {
        fetchInstallation: async () => installation,
        listRepos: async () => repos,
      },
    );

    expect(result.repoCount).toBe(2);

    const [orgRow] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.installationId, 555_111n));
    expect(orgRow?.githubLogin).toBe("acme-co");
    expect(orgRow?.plan).toBe("trial");
    expect(orgRow?.trialEndsAt).toBeInstanceOf(Date);

    const memberships = await db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.userId, user.id));
    expect(memberships).toHaveLength(1);
    expect(memberships[0]?.role).toBe("owner");

    const repoRows = await db
      .select()
      .from(repositories)
      .where(eq(repositories.orgId, result.org.id));
    expect(repoRows).toHaveLength(2);
    expect(repoRows.every((r) => r.active)).toBe(true);
  });

  it("re-running install is idempotent (no duplicate org or membership)", async () => {
    const user = await upsertUserFromGithub(db, {
      githubUserId: 10002n,
      email: "owner2@acme.example",
      name: null,
      avatarUrl: null,
    });
    const installation = makeInstallation({ id: 555_222n });
    const repos = [makeRepo(8001n, "alpha")];
    const hooks = {
      fetchInstallation: async () => installation,
      listRepos: async () => repos,
    };

    await completeInstall(db, fakeAppConfig, { installationId: 555_222, userId: user.id }, hooks);
    await completeInstall(db, fakeAppConfig, { installationId: 555_222, userId: user.id }, hooks);

    const orgRows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.installationId, 555_222n));
    expect(orgRows).toHaveLength(1);

    const memberships = await db
      .select()
      .from(orgMemberships)
      .where(eq(orgMemberships.userId, user.id));
    expect(memberships).toHaveLength(1);
  });
});

describeIfDb("GitHub webhook handler", () => {
  it("installation.created upserts org and snapshots repos", async () => {
    const result = await handleWebhook(db, "installation", {
      action: "created",
      installation: {
        id: 666_111,
        account: { id: 5001, login: "webhook-org", type: "Organization" },
      },
      repositories: [
        {
          id: 9001,
          name: "svc-a",
          full_name: "webhook-org/svc-a",
          default_branch: "main",
          private: false,
        },
        {
          id: 9002,
          name: "svc-b",
          full_name: "webhook-org/svc-b",
          default_branch: "main",
          private: true,
        },
      ],
    });
    expect(result.kind).toBe("installation");
    if (result.kind !== "installation") throw new Error("unreachable");
    expect(result.repoCount).toBe(2);

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.installationId, 666_111n));
    expect(org?.githubLogin).toBe("webhook-org");

    const repos = await db
      .select()
      .from(repositories)
      .where(eq(repositories.orgId, org?.id ?? ""));
    expect(repos).toHaveLength(2);
  });

  it("installation_repositories.added/removed reconciles repo set", async () => {
    // Bootstrap an org with two repos via the install path.
    await handleWebhook(db, "installation", {
      action: "created",
      installation: {
        id: 666_222,
        account: { id: 5002, login: "delta-org", type: "Organization" },
      },
      repositories: [
        {
          id: 9101,
          name: "keep",
          full_name: "delta-org/keep",
          default_branch: "main",
          private: false,
        },
        {
          id: 9102,
          name: "drop",
          full_name: "delta-org/drop",
          default_branch: "main",
          private: false,
        },
      ],
    });

    await handleWebhook(db, "installation_repositories", {
      action: "added",
      installation: {
        id: 666_222,
        account: { id: 5002, login: "delta-org", type: "Organization" },
      },
      repositories_added: [
        {
          id: 9103,
          name: "new",
          full_name: "delta-org/new",
          default_branch: "main",
          private: false,
        },
      ],
      repositories_removed: [
        {
          id: 9102,
          name: "drop",
          full_name: "delta-org/drop",
          default_branch: "main",
          private: false,
        },
      ],
    });

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.installationId, 666_222n));
    const repos = await db
      .select()
      .from(repositories)
      .where(eq(repositories.orgId, org?.id ?? ""));
    const byId = Object.fromEntries(repos.map((r) => [r.githubRepoId.toString(), r]));
    expect(byId["9101"]?.active).toBe(true);
    expect(byId["9102"]?.active).toBe(false);
    expect(byId["9103"]?.active).toBe(true);
  });

  it("installation.deleted removes the org and cascades", async () => {
    await handleWebhook(db, "installation", {
      action: "created",
      installation: {
        id: 666_333,
        account: { id: 5003, login: "gone-org", type: "Organization" },
      },
      repositories: [
        { id: 9201, name: "r", full_name: "gone-org/r", default_branch: "main", private: false },
      ],
    });

    const result = await handleWebhook(db, "installation", {
      action: "deleted",
      installation: {
        id: 666_333,
        account: { id: 5003, login: "gone-org", type: "Organization" },
      },
    });
    expect(result.kind).toBe("installation");

    const remaining = await db
      .select()
      .from(organizations)
      .where(eq(organizations.installationId, 666_333n));
    expect(remaining).toHaveLength(0);

    // Cascade should have removed the repo too.
    const repos = await db.select().from(repositories).where(eq(repositories.githubRepoId, 9201n));
    expect(repos).toHaveLength(0);
  });

  it("ignores unknown event types", async () => {
    const result = await handleWebhook(db, "ping", {});
    expect(result.kind).toBe("ignored");
  });

  it("workflow_run.completed enqueues a run-ingest job", async () => {
    // Set up an active org+repo to receive the webhook.
    const installation = makeInstallation({ id: 777_111n });
    installation.account.id = 777_222n;
    await handleWebhook(db, "installation", {
      action: "created",
      installation: {
        id: Number(installation.id),
        account: {
          id: Number(installation.account.id),
          login: "wfrun-org",
          type: "Organization",
        },
      },
      repositories: [
        {
          id: 88_881,
          name: "wfrun-repo",
          full_name: "wfrun-org/wfrun-repo",
          default_branch: "main",
          private: false,
        },
      ],
    });

    const calls: Array<{ orgId: string; repoId: string; githubRunId: string }> = [];
    const enqueueRunIngest = async (p: { orgId: string; repoId: string; githubRunId: string }) => {
      calls.push(p);
    };

    const result = await handleWebhook(
      db,
      "workflow_run",
      {
        action: "completed",
        workflow_run: { id: 12_345_678 },
        repository: { id: 88_881 },
        installation: { id: Number(installation.id), account: payloadAccount(installation) },
      },
      { enqueueRunIngest },
    );

    expect(result).toMatchObject({ kind: "workflow_run", action: "completed", enqueued: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.githubRunId).toBe("12345678");

    const [stored] = await db
      .select()
      .from(repositories)
      .where(eq(repositories.githubRepoId, 88_881n));
    expect(calls[0]?.repoId).toBe(stored?.id);
    expect(calls[0]?.orgId).toBe(stored?.orgId);
  });

  it("workflow_run with non-completed action is a no-op", async () => {
    const calls: Array<unknown> = [];
    const result = await handleWebhook(
      db,
      "workflow_run",
      {
        action: "in_progress",
        workflow_run: { id: 1 },
        repository: { id: 88_881 },
      },
      { enqueueRunIngest: async (p) => void calls.push(p) },
    );
    expect(result).toEqual({
      kind: "workflow_run",
      action: "in_progress",
      enqueued: false,
      reason: "non-completed",
    });
    expect(calls).toHaveLength(0);
  });

  it("workflow_run for an unknown repo is ignored without throwing", async () => {
    const result = await handleWebhook(
      db,
      "workflow_run",
      {
        action: "completed",
        workflow_run: { id: 1 },
        repository: { id: 999_999_999 },
      },
      { enqueueRunIngest: async () => {} },
    );
    expect(result).toMatchObject({
      kind: "workflow_run",
      enqueued: false,
      reason: "unknown-repo",
    });
  });
});

function payloadAccount(inst: GithubInstallation) {
  return {
    id: Number(inst.account.id),
    login: inst.account.login,
    type: inst.account.type,
  };
}

if (!baseUrl) {
  describe.skip("install flow (TEST_DATABASE_URL unset)", () => {
    it.skip("set TEST_DATABASE_URL to run", () => {});
  });
}

// Pure unit tests — no DB needed, run regardless.
describe("upsertUserFromGithub re-export sanity", () => {
  it("install-flow module exposes completeInstall", () => {
    expect(typeof completeInstall).toBe("function");
    expect(typeof handleWebhook).toBe("function");
    expect(typeof users).toBe("object"); // exercise the import
  });
});
