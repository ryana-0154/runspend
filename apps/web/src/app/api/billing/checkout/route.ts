import { createCheckoutSession, type PaidPlan } from "@runspend/billing";
import { getDb } from "@runspend/db";
import { logger } from "@runspend/shared";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadOrgIfOwner } from "@/lib/billing/authorize";
import { ensureStripeCustomer } from "@/lib/billing/customer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PAID_PLANS: ReadonlySet<PaidPlan> = new Set(["starter", "growth", "scale"]);

function parsePlan(value: unknown): PaidPlan | null {
  return typeof value === "string" && PAID_PLANS.has(value as PaidPlan) ? (value as PaidPlan) : null;
}

/**
 * Start a Stripe Checkout session for the requested tier. Owner-only.
 * Body: { orgId: string, plan: 'starter'|'growth'|'scale' }.
 */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const orgId = (body as { orgId?: unknown })?.orgId;
  const plan = parsePlan((body as { plan?: unknown })?.plan);
  if (typeof orgId !== "string" || !plan) {
    return NextResponse.json({ error: "missing orgId or plan" }, { status: 400 });
  }

  const db = getDb();
  const org = await loadOrgIfOwner(db, session.user.id, orgId);
  if (!org) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const customerId = await ensureStripeCustomer(db, org, session.user.email);

  const origin = req.nextUrl.origin;
  try {
    const url = await createCheckoutSession({
      orgId,
      customerId,
      plan,
      successUrl: `${origin}/dashboard/settings/billing?status=success`,
      cancelUrl: `${origin}/dashboard/settings/billing?status=cancelled`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, orgId, plan }, `stripe checkout failed — ${message}`);
    return NextResponse.json({ error: "checkout failed" }, { status: 500 });
  }
}
