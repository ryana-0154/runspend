import { getEnv } from "@runspend/shared";
import type { NextRequest } from "next/server";

/**
 * Resolve the public origin for redirect URLs (Stripe success/cancel,
 * portal return). Behind Railway's reverse proxy, `req.nextUrl.origin`
 * resolves to `http://localhost:8080` (the container-internal port) —
 * not what we want to hand to Stripe.
 *
 * Prefer AUTH_URL (already the canonical public URL for the deploy);
 * fall back to X-Forwarded-Proto/Host pair; last-resort the request's
 * own origin (correct for local `pnpm dev`).
 */
export function publicOrigin(req: NextRequest): string {
  const authUrl = getEnv().AUTH_URL;
  if (authUrl) return authUrl.replace(/\/$/, "");

  const proto = req.headers.get("x-forwarded-proto");
  const host = req.headers.get("x-forwarded-host");
  if (proto && host) return `${proto}://${host}`;

  return req.nextUrl.origin;
}
