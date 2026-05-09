import { constructWebhookEvent, handleStripeWebhook } from "@runspend/billing";
import { getDb } from "@runspend/db";
import { logger } from "@runspend/shared";
import { type NextRequest, NextResponse } from "next/server";
import { billingEnabled } from "@/lib/billing/enabled";

export const runtime = "nodejs";
// Stripe signature verification needs the raw body — no caching, no
// static optimization.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (!billingEnabled()) {
    return NextResponse.json({ error: "billing disabled" }, { status: 503 });
  }
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing stripe-signature" }, { status: 400 });
  }

  const rawBody = await req.text();

  let event: ReturnType<typeof constructWebhookEvent>;
  try {
    event = constructWebhookEvent(rawBody, signature);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err: message }, "stripe webhook: signature verification failed");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  try {
    const result = await handleStripeWebhook(getDb(), event);
    logger.info({ eventId: event.id, type: event.type, result }, "stripe webhook: applied");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(
      { err, errorMessage: message, errorStack: stack, eventId: event.id, type: event.type },
      `stripe webhook: handler failed (${event.type}) — ${message}`,
    );
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
