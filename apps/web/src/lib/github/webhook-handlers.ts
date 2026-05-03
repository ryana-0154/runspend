import { type Database, organizations } from "@runspend/db";
import {
  type GithubInstallation,
  type GithubRepositoryRef,
  readAccount,
  readRepo,
  syncRepositories,
  upsertOrgFromInstallation,
} from "@runspend/github";
import { eq } from "drizzle-orm";

interface WebhookPayload {
  action?: unknown;
  installation?: unknown;
  repositories?: unknown;
  repositories_added?: unknown;
  repositories_removed?: unknown;
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

export type WebhookHandlerResult =
  | { kind: "installation"; action: string; orgId?: string; repoCount?: number }
  | { kind: "installation_repositories"; orgId: string; added: number; removed: number }
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

  return { kind: "ignored", event };
}
