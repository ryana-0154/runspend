import { type Database, type organizations, repositories as repositoriesTable } from "@runspend/db";
import {
  fetchInstallation,
  type GithubAppConfig,
  type GithubRepositoryRef,
  linkUserAsOwner,
  listInstallationRepositories,
  syncRepositories,
  upsertOrgFromInstallation,
} from "@runspend/github";
import { and, eq } from "drizzle-orm";

export interface CompleteInstallInput {
  installationId: number;
  userId: string;
}

export interface CompleteInstallResult {
  org: typeof organizations.$inferSelect;
  repoCount: number;
}

export type KickoffRepoIngest = (input: { orgId: string; repoId: string }) => Promise<void>;

export interface CompleteInstallHooks {
  fetchInstallation?: typeof fetchInstallation;
  listRepos?: (id: number) => Promise<GithubRepositoryRef[]>;
  /** Called once per active repo after sync. Production wires to BullMQ; tests pass a stub. */
  kickoffRepoIngest?: KickoffRepoIngest;
}

/**
 * End-to-end "user just installed the App" flow:
 *  1. Pull installation metadata (org/login/account) from GitHub.
 *  2. Upsert the organizations row.
 *  3. Link the current user as owner.
 *  4. Snapshot the installation's repo list into the repositories table.
 *  5. Enqueue a backfill + register hourly incremental for each active repo.
 *
 * Pure function over the DB so the integration test can drive it directly.
 */
export async function completeInstall(
  db: Database,
  appConfig: GithubAppConfig,
  input: CompleteInstallInput,
  hooks?: CompleteInstallHooks,
): Promise<CompleteInstallResult> {
  const installation = await (hooks?.fetchInstallation ?? fetchInstallation)(
    appConfig,
    input.installationId,
  );

  const org = await upsertOrgFromInstallation(db, { installation });
  await linkUserAsOwner(db, { userId: input.userId, orgId: org.id });

  const repos = await (hooks?.listRepos
    ? hooks.listRepos(input.installationId)
    : listInstallationRepositories(appConfig, input.installationId));
  await syncRepositories(db, { orgId: org.id, snapshot: repos });

  const kickoff = hooks?.kickoffRepoIngest;
  if (kickoff && repos.length > 0) {
    // Re-read the active repo rows so we have their UUIDs (sync upsert
    // doesn't return them). Limited to the just-snapshotted set via
    // active=true filter on the org.
    const activeRows = await db
      .select({ id: repositoriesTable.id })
      .from(repositoriesTable)
      .where(and(eq(repositoriesTable.orgId, org.id), eq(repositoriesTable.active, true)));
    for (const row of activeRows) {
      await kickoff({ orgId: org.id, repoId: row.id });
    }
  }

  return { org, repoCount: repos.length };
}
