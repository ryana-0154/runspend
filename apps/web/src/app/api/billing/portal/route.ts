import { createPortalSession } from "@runspend/billing";
import { getDb } from "@runspend/db";
import { logger } from "@runspend/shared";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { loadOrgIfOwner } from "@/lib/billing/authorize";
import { billingEnabled } from "@/lib/billing/enabled";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Open a Stripe Customer Portal session for self-serve plan management.
 * Owner-only. Body: { orgId: string }.
 */
export async function POST(req: NextRequest) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: "billing disabled" }, { status: 503 });
  }
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const orgId = (body as { orgId?: unknown })?.orgId;
  if (typeof orgId !== "string") {
    return NextResponse.json({ error: "missing orgId" }, { status: 400 });
  }

  const db = getDb();
  const org = await loadOrgIfOwner(db, session.user.id, orgId);
  if (!org) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (!org.stripeCustomerId) {
    return NextResponse.json(
      { error: "no stripe customer — start a checkout first" },
      { status: 400 },
    );
  }

  try {
    const url = await createPortalSession({
      customerId: org.stripeCustomerId,
      returnUrl: `${req.nextUrl.origin}/dashboard/settings/billing`,
    });
    return NextResponse.json({ url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ err, orgId }, `stripe portal failed — ${message}`);
    return NextResponse.json({ error: "portal failed" }, { status: 500 });
  }
}
