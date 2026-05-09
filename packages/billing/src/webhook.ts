import { type Database, organizations, subscriptions } from "@runspend/db";
import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { type Plan, planForPriceId } from "./plans";

export type WebhookHandlerResult =
  | { kind: "subscription_synced"; orgId: string; plan: Plan; status: string }
  | { kind: "subscription_canceled"; orgId: string }
  | { kind: "ignored"; type: string; reason?: string };

/**
 * Reconcile a Stripe event into our subscriptions + organizations rows.
 * Pure over `Database` so the route handler stays thin and tests can drive
 * it directly with constructed `Stripe.Event` shapes.
 *
 * We only care about three event families:
 *   - customer.subscription.created/updated → upsert sub row, flip org.plan
 *   - customer.subscription.deleted → mark canceled
 *
 * `invoice.payment_failed` arrives bundled with a `subscription.updated`
 * status='past_due', so we don't subscribe to invoice events directly.
 */
export async function handleStripeWebhook(
  db: Database,
  event: Stripe.Event,
): Promise<WebhookHandlerResult> {
  if (
    event.type === "customer.subscription.created" ||
    event.type === "customer.subscription.updated"
  ) {
    return syncSubscription(db, event.data.object);
  }
  if (event.type === "customer.subscription.deleted") {
    return cancelSubscription(db, event.data.object);
  }
  return { kind: "ignored", type: event.type };
}

function readOrgId(sub: Stripe.Subscription): string | null {
  const fromMetadata = sub.metadata?.org_id;
  if (typeof fromMetadata === "string" && fromMetadata.length > 0) return fromMetadata;
  return null;
}

function readPrimaryPriceId(sub: Stripe.Subscription): string | null {
  const item = sub.items.data[0];
  if (!item) return null;
  return item.price?.id ?? null;
}

async function syncSubscription(
  db: Database,
  sub: Stripe.Subscription,
): Promise<WebhookHandlerResult> {
  const orgId = readOrgId(sub);
  if (!orgId) {
    return { kind: "ignored", type: "subscription", reason: "missing org_id metadata" };
  }
  const priceId = readPrimaryPriceId(sub);
  if (!priceId) {
    return { kind: "ignored", type: "subscription", reason: "missing price id" };
  }
  const plan = planForPriceId(priceId);
  if (!plan) {
    // Subscription created against a price we don't recognize — log via the
    // ignored result so the route layer can warn.
    return { kind: "ignored", type: "subscription", reason: `unknown price ${priceId}` };
  }

  const currentPeriodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000)
    : null;
  const cancelAt = sub.cancel_at ? new Date(sub.cancel_at * 1000) : null;

  await db.transaction(async (tx) => {
    await tx
      .insert(subscriptions)
      .values({
        orgId,
        stripeSubscriptionId: sub.id,
        stripePriceId: priceId,
        plan,
        status: sub.status,
        currentPeriodEnd,
        cancelAt,
      })
      .onConflictDoUpdate({
        target: subscriptions.stripeSubscriptionId,
        set: {
          stripePriceId: priceId,
          plan,
          status: sub.status,
          currentPeriodEnd,
          cancelAt,
          updatedAt: new Date(),
        },
      });

    // Promote org to the paid plan and clear the trial clock so the
    // dashboard stops showing "trial ends in N days".
    await tx
      .update(organizations)
      .set({ plan, trialEndsAt: null })
      .where(eq(organizations.id, orgId));
  });

  return { kind: "subscription_synced", orgId, plan, status: sub.status };
}

async function cancelSubscription(
  db: Database,
  sub: Stripe.Subscription,
): Promise<WebhookHandlerResult> {
  const orgId = readOrgId(sub);
  if (!orgId) {
    return { kind: "ignored", type: "subscription_deleted", reason: "missing org_id metadata" };
  }
  await db.transaction(async (tx) => {
    await tx
      .update(subscriptions)
      .set({ status: "canceled", updatedAt: new Date() })
      .where(eq(subscriptions.stripeSubscriptionId, sub.id));
    await tx
      .update(organizations)
      .set({ plan: "cancelled" })
      .where(eq(organizations.id, orgId));
  });
  return { kind: "subscription_canceled", orgId };
}
