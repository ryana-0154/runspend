import { type Database, organizations, repositories } from "@runspend/db";
import { getEnv } from "@runspend/shared";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { type Plan, repoLimit } from "./plans";

export interface EnforceResult {
  /** Active repos before enforcement ran. */
  before: number;
  /** Active repos after enforcement (== min(before, limit)). */
  after: number;
  /** IDs that were marked inactive by this call. */
  deactivated: string[];
}

/**
 * Bring the org back under its plan limit by deactivating the
 * lowest-priority repos. "Lowest priority" = oldest `last_ingested_run_id`
 * first (proxy for "least active"), with `created_at` as a tiebreaker so
 * the result is deterministic for a fresh install where no repo has runs yet.
 *
 * Idempotent — running twice is a no-op once we're at or below the limit.
 */
export async function enforceRepoLimit(db: Database, orgId: string): Promise<EnforceResult> {
  if (!getEnv().BILLING_ENABLED) return { before: 0, after: 0, deactivated: [] };

  const [orgRow] = await db
    .select({ plan: organizations.plan })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!orgRow) return { before: 0, after: 0, deactivated: [] };

  const limit = repoLimit(orgRow.plan as Plan);

  const active = await db
    .select({ id: repositories.id })
    .from(repositories)
    .where(and(eq(repositories.orgId, orgId), eq(repositories.active, true)))
    .orderBy(
      // nulls-first so never-ingested repos are deactivated before
      // repos that have produced any data.
      sql`${repositories.lastIngestedRunId} ASC NULLS FIRST`,
      asc(repositories.createdAt),
    );

  const before = active.length;
  if (before <= limit) return { before, after: before, deactivated: [] };

  const toDeactivate = active.slice(0, before - limit).map((r) => r.id);
  await db
    .update(repositories)
    .set({ active: false })
    .where(and(eq(repositories.orgId, orgId), inArray(repositories.id, toDeactivate)));

  return { before, after: limit, deactivated: toDeactivate };
}
