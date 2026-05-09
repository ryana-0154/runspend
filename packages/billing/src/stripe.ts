import { getEnv } from "@runspend/shared";
import Stripe from "stripe";
import { type PaidPlan, priceIdForPlan } from "./plans";

let cached: Stripe | undefined;

export function getStripe(): Stripe {
  if (cached) return cached;
  const env = getEnv();
  if (!env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not configured");
  cached = new Stripe(env.STRIPE_SECRET_KEY, {
    // Pin to a known API version so silent server-side schema changes
    // can't break webhook decoding. Bump intentionally + retest.
    apiVersion: "2025-02-24.acacia",
  });
  return cached;
}

export interface CreateCustomerInput {
  orgId: string;
  githubLogin: string;
  email?: string | null;
}

export async function createCustomer(input: CreateCustomerInput): Promise<string> {
  const customer = await getStripe().customers.create({
    name: input.githubLogin,
    email: input.email ?? undefined,
    metadata: { org_id: input.orgId, github_login: input.githubLogin },
  });
  return customer.id;
}

export interface CreateCheckoutInput {
  customerId: string;
  plan: PaidPlan;
  successUrl: string;
  cancelUrl: string;
  /** Org id mirrored into the session metadata so the webhook can find it without a customer round-trip. */
  orgId: string;
}

export async function createCheckoutSession(input: CreateCheckoutInput): Promise<string> {
  const session = await getStripe().checkout.sessions.create({
    mode: "subscription",
    customer: input.customerId,
    line_items: [{ price: priceIdForPlan(input.plan), quantity: 1 }],
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    metadata: { org_id: input.orgId },
    subscription_data: {
      metadata: { org_id: input.orgId },
    },
  });
  if (!session.url) throw new Error("checkout session created without url");
  return session.url;
}

export async function createPortalSession(input: {
  customerId: string;
  returnUrl: string;
}): Promise<string> {
  const session = await getStripe().billingPortal.sessions.create({
    customer: input.customerId,
    return_url: input.returnUrl,
  });
  return session.url;
}

/**
 * Verify + parse a raw Stripe webhook body. Returns the typed event so the
 * caller can pattern-match on `event.type`. Throws on signature mismatch
 * (route translates to 400).
 */
export function constructWebhookEvent(rawBody: string, signature: string): Stripe.Event {
  const env = getEnv();
  if (!env.STRIPE_WEBHOOK_SECRET) throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  return getStripe().webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET);
}
