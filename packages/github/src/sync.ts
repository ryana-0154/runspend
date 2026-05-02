import { type Database, organizations, orgMemberships, repositories } from "@runspend/db";
import { eq, inArray } from "drizzle-orm";
import type { GithubInstallation, GithubRepositoryRef } from "./installation.js";

export interface UpsertOrgFromInstallationInput {
  installation: GithubInstallation;
  /** Trial length in days (per PRD §6 — 14-day trial). */
  trialDays?: number;
}

/**
 * Idempotently create-or-update the organizations row for a GitHub
 * installation. Used by both the OAuth install callback and webhook
 * handlers — the same install_id always lands on the same row.
 */
export async function upsertOrgFromInstallation(
  db: Database,
  input: UpsertOrgFromInstallationInput,
) {
  const { installation, trialDays = 14 } = input;
  const trialEndsAt = new Date(Date.now() + trialDays * 24 * 60 * 60 * 1000);

  const [existing] = await db
    .select()
    .from(organizations)
    .where(eq(organizations.installationId, installation.id))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(organizations)
      .values({
        githubOrgId: installation.account.id,
        githubLogin: installation.account.login,
        installationId: installation.id,
        plan: "trial",
        trialEndsAt,
      })
      .returning();
    if (!created) throw new Error("upsertOrgFromInstallation: insert returned no row");
    return created;
  }

  const [updated] = await db
    .update(organizations)
    .set({
      githubOrgId: installation.account.id,
      githubLogin: installation.account.login,
    })
    .where(eq(organizations.installationId, installation.id))
    .returning();
  if (!updated) throw new Error("upsertOrgFromInstallation: update returned no row");
  return updated;
}

export interface LinkUserAsOwnerInput {
  userId: string;
  orgId: string;
}

/**
 * Link the installing user to the org as owner. Idempotent — re-runs are
 * no-ops thanks to the unique(user_id, org_id) constraint.
 */
export async function linkUserAsOwner(db: Database, input: LinkUserAsOwnerInput) {
  await db
    .insert(orgMemberships)
    .values({ userId: input.userId, orgId: input.orgId, role: "owner" })
    .onConflictDoNothing({ target: [orgMemberships.userId, orgMemberships.orgId] });
}

export interface SyncRepositoriesInput {
  orgId: string;
  /** Repos GitHub says are in scope right now (full snapshot or +/- delta). */
  added?: GithubRepositoryRef[];
  removed?: GithubRepositoryRef[];
  /** When provided, replaces the org's whole repo list. */
  snapshot?: GithubRepositoryRef[];
}

/**
 * Reconcile the repositories table with what GitHub says we can see.
 *
 * - `snapshot`: full replace — present repos become active, missing ones
 *   get marked active=false (but not deleted, so historical run data still
 *   has a parent row).
 * - `added`/`removed`: delta apply — added ones upsert active, removed
 *   ones flip active=false.
 */
export async function syncRepositories(db: Database, input: SyncRepositoriesInput) {
  if (input.snapshot) {
    // Mark every repo for this org inactive, then reactivate the ones in
    // the snapshot via upsert. Cheap — orgs typically have ≤ a few hundred
    // repos.
    await db.update(repositories).set({ active: false }).where(eq(repositories.orgId, input.orgId));

    for (const repo of input.snapshot) {
      await db
        .insert(repositories)
        .values({
          orgId: input.orgId,
          githubRepoId: repo.id,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          active: true,
        })
        .onConflictDoUpdate({
          target: repositories.githubRepoId,
          set: {
            name: repo.name,
            defaultBranch: repo.defaultBranch,
            isPrivate: repo.isPrivate,
            active: true,
          },
        });
    }
    return;
  }

  if (input.added) {
    for (const repo of input.added) {
      await db
        .insert(repositories)
        .values({
          orgId: input.orgId,
          githubRepoId: repo.id,
          name: repo.name,
          defaultBranch: repo.defaultBranch,
          isPrivate: repo.isPrivate,
          active: true,
        })
        .onConflictDoUpdate({
          target: repositories.githubRepoId,
          set: {
            name: repo.name,
            defaultBranch: repo.defaultBranch,
            isPrivate: repo.isPrivate,
            active: true,
          },
        });
    }
  }

  if (input.removed && input.removed.length > 0) {
    await db
      .update(repositories)
      .set({ active: false })
      .where(
        inArray(
          repositories.githubRepoId,
          input.removed.map((r) => r.id),
        ),
      );
  }
}
