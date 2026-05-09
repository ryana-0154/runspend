import { type Database, organizations, subscriptions } from "@runspend/db";
import { desc, eq } from "drizzle-orm";
import { type AccessState, resolveAccess } from "./access";

// Read directly from process.env rather than via getEnv() so the whole
// app schema (DATABASE_URL etc.) doesn't need to be valid just to ask
// whether billing is enabled. Default is "enabled" — explicit "false"
// disables.
function billingDisabled(): boolean {
  return process.env.BILLING_ENABLED === "false";
}

/**
 * One-call access lookup for an org. Loads the org row + its most recent
 * subscription (if any) and returns the resolved access state. Used by
 * the webhook fast-path and the worker job processors before doing any
 * ingest work — gating is centralized here so the rules stay consistent.
 *
 * Returns `null` when the org doesn't exist (caller treats as ignore).
 *
 * When `BILLING_ENABLED=false`, returns a permissive `paid_active` state
 * without hitting the DB so test/dev environments don't need Stripe.
 */
export async function loadAccessState(db: Database, orgId: string): Promise<AccessState | null> {
  if (billingDisabled()) return { kind: "paid_active", plan: "trial" };
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
