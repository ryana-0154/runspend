import { type Database, organizations, subscriptions } from "@runspend/db";
import { desc, eq } from "drizzle-orm";
import { type AccessState, resolveAccess } from "./access";

/**
 * One-call access lookup for an org. Loads the org row + its most recent
 * subscription (if any) and returns the resolved access state. Used by
 * the webhook fast-path and the worker job processors before doing any
 * ingest work — gating is centralized here so the rules stay consistent.
 *
 * Returns `null` when the org doesn't exist (caller treats as ignore).
 */
export async function loadAccessState(
  db: Database,
  orgId: string,
): Promise<AccessState | null> {
  const [org] = await db
    .select({ plan: organizations.plan, trialEndsAt: organizations.trialEndsAt })
    .from(organizations)
    .where(eq(organizations.id, orgId))
    .limit(1);
  if (!org) return null;

  const [sub] = await db
    .select({ status: subscriptions.status })
    .from(subscriptions)
    .where(eq(subscriptions.orgId, orgId))
    .orderBy(desc(subscriptions.updatedAt))
    .limit(1);

  return resolveAccess({ org, subscription: sub ?? null });
}
