import { getDb } from "@runspend/db";
import { verifyWebhookSignature } from "@runspend/github";
import { logger } from "@runspend/shared";
import { type NextRequest, NextResponse } from "next/server";
import { handleWebhook } from "@/lib/github/webhook-handlers";

export const runtime = "nodejs";
// Webhook bodies must be read raw to verify the HMAC — disable any
// route caching/static optimization.
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const secret = process.env.GITHUB_APP_WEBHOOK_SECRET;
  if (!secret) {
    logger.error("github webhook: GITHUB_APP_WEBHOOK_SECRET is not set");
    return NextResponse.json({ error: "webhooks not configured" }, { status: 503 });
  }

  const event = req.headers.get("x-github-event");
  const signature = req.headers.get("x-hub-signature-256");
  const deliveryId = req.headers.get("x-github-delivery") ?? "unknown";
  if (!event) {
    return NextResponse.json({ error: "missing x-github-event" }, { status: 400 });
  }

  const rawBody = await req.text();
  if (!verifyWebhookSignature(rawBody, signature, secret)) {
    logger.warn({ deliveryId, event }, "github webhook: signature mismatch");
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "invalid payload" }, { status: 400 });
  }

  try {
    const result = await handleWebhook(getDb(), event, payload);
    logger.info({ deliveryId, event, result }, "github webhook: applied");
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    logger.error({ err, deliveryId, event }, "github webhook: handler failed");
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }
}
