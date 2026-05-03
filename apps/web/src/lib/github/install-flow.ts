import type { Database, organizations } from "@runspend/db";
import {
  fetchInstallation,
  type GithubAppConfig,
  type GithubRepositoryRef,
  linkUserAsOwner,
  listInstallationRepositories,
  syncRepositories,
  upsertOrgFromInstallation,
} from "@runspend/github";

export interface CompleteInstallInput {
  installationId: number;
  userId: string;
}

export interface CompleteInstallResult {
  org: typeof organizations.$inferSelect;
  repoCount: number;
}

/**
 * End-to-end "user just installed the App" flow:
 *  1. Pull installation metadata (org/login/account) from GitHub.
 *  2. Upsert the organizations row.
 *  3. Link the current user as owner.
 *  4. Snapshot the installation's repo list into the repositories table.
 *
 * Pure function over the DB so the integration test can drive it directly.
 */
export async function completeInstall(
  db: Database,
  appConfig: GithubAppConfig,
  input: CompleteInstallInput,
  // Override hooks for tests — production passes through to GitHub.
  hooks?: {
    fetchInstallation?: typeof fetchInstallation;
    listRepos?: (id: number) => Promise<GithubRepositoryRef[]>;
  },
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

  return { org, repoCount: repos.length };
}
