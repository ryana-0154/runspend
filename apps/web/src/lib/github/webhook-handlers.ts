import { type Database, organizations, repositories as repositoriesTable } from "@runspend/db";
import {
  type GithubInstallation,
  type GithubRepositoryRef,
  readAccount,
  readRepo,
  syncRepositories,
  upsertOrgFromInstallation,
} from "@runspend/github";
import type { IngestRunPayload } from "@runspend/shared";
import { eq } from "drizzle-orm";

interface WebhookPayload {
  action?: unknown;
  installation?: unknown;
  repositories?: unknown;
  repositories_added?: unknown;
  repositories_removed?: unknown;
  workflow_run?: unknown;
  repository?: unknown;
}

export type EnqueueRunIngest = (payload: IngestRunPayload) => Promise<void>;

export interface HandleWebhookDeps {
  /** Optional — handler logs and skips when absent (used by integration tests). */
  enqueueRunIngest?: EnqueueRunIngest;
}

function readInstallation(raw: unknown): GithubInstallation {
  if (!raw || typeof raw !== "object") throw new Error("installation payload missing");
  const i = raw as Record<string, unknown>;
  const id = i.id;
  if (typeof id !== "number" && typeof id !== "string") {
    throw new Error("installation.id invalid");
  }
  return { id: BigInt(id), account: readAccount(i.account) };
}

function readRepoArray(raw: unknown): GithubRepositoryRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.map(readRepo);
}

function readBigIntField(raw: unknown, field: string): bigint {
  if (typeof raw !== "number" && typeof raw !== "string") {
    throw new Error(`${field} invalid`);
  }
  return BigInt(raw);
}

export type WebhookHandlerResult =
  | { kind: "installation"; action: string; orgId?: string; repoCount?: number }
  | { kind: "installation_repositories"; orgId: string; added: number; removed: number }
  | { kind: "workflow_run"; action: string; enqueued: boolean; reason?: string }
  | { kind: "ignored"; event: string };

/**
 * Apply a GitHub App webhook payload to the database.
 * Pure function over a Database — driven directly by the route handler and
 * by the integration test.
 */
export async function handleWebhook(
  db: Database,
  event: string,
  payload: WebhookPayload,
  deps: HandleWebhookDeps = {},
): Promise<WebhookHandlerResult> {
  if (event === "installation") {
    const action = typeof payload.action === "string" ? payload.action : "unknown";
    const installation = readInstallation(payload.installation);

    if (action === "deleted") {
      // Cascading FK cleans up memberships and repositories.
      await db.delete(organizations).where(eq(organizations.installationId, installation.id));
      return { kind: "installation", action };
    }

    // created / new_permissions_accepted / suspend / unsuspend — keep org row
    // up to date with whatever GitHub reports as the current state.
    const org = await upsertOrgFromInstallation(db, { installation });
    const repos = readRepoArray(payload.repositories);
    if (repos.length > 0) {
      await syncRepositories(db, { orgId: org.id, snapshot: repos });
    }
    return { kind: "installation", action, orgId: org.id, repoCount: repos.length };
  }

  if (event === "installation_repositories") {
    const installation = readInstallation(payload.installation);
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.installationId, installation.id))
      .limit(1);
    if (!org) {
      // Webhook arrived before the install callback completed — race; let
      // GitHub retry by returning an error. Common in practice.
      throw new Error(`installation_repositories webhook for unknown install ${installation.id}`);
    }
    const added = readRepoArray(payload.repositories_added);
    const removed = readRepoArray(payload.repositories_removed);
    await syncRepositories(db, { orgId: org.id, added, removed });
    return {
      kind: "installation_repositories",
      orgId: org.id,
      added: added.length,
      removed: removed.length,
    };
  }

  if (event === "workflow_run") {
    const action = typeof payload.action === "string" ? payload.action : "unknown";
    // Spec §4.3: only completed runs trigger ingest. `requested` and
    // `in_progress` would just queue the same run multiple times — wasteful.
    if (action !== "completed") {
      return { kind: "workflow_run", action, enqueued: false, reason: "non-completed" };
    }

    const run = payload.workflow_run;
    const repository = payload.repository;
    if (!run || typeof run !== "object" || !repository || typeof repository !== "object") {
      throw new Error("workflow_run payload missing run or repository");
    }
    const githubRunId = readBigIntField((run as Record<string, unknown>).id, "workflow_run.id");
    const githubRepoId = readBigIntField(
      (repository as Record<string, unknown>).id,
      "repository.id",
    );

    const [repoRow] = await db
      .select({
        id: repositoriesTable.id,
        orgId: repositoriesTable.orgId,
        active: repositoriesTable.active,
      })
      .from(repositoriesTable)
      .where(eq(repositoriesTable.githubRepoId, githubRepoId))
      .limit(1);

    if (!repoRow) {
      // Webhook for a repo we don't have on file — likely arriving before
      // the install snapshot, or a repo we've never seen. Don't error
      // (would trigger GitHub's retry storm); ignore quietly.
      return { kind: "workflow_run", action, enqueued: false, reason: "unknown-repo" };
    }
    if (!repoRow.active) {
      return { kind: "workflow_run", action, enqueued: false, reason: "inactive-repo" };
    }

    if (deps.enqueueRunIngest) {
      await deps.enqueueRunIngest({
        orgId: repoRow.orgId,
        repoId: repoRow.id,
        githubRunId: githubRunId.toString(),
      });
      return { kind: "workflow_run", action, enqueued: true };
    }
    return { kind: "workflow_run", action, enqueued: false, reason: "no-enqueue-fn" };
  }

  return { kind: "ignored", event };
}
