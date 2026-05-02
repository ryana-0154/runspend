import { createHmac, timingSafeEqual } from "node:crypto";

const SIGNATURE_PREFIX = "sha256=";

/**
 * Verify a GitHub webhook signature using the App's webhook secret.
 * GitHub sends `X-Hub-Signature-256: sha256=<hmac-sha256(secret, body)>`.
 *
 * `payload` MUST be the raw request body bytes — JSON.stringify(body) of
 * a parsed object will not match because GitHub canonicalizes whitespace
 * differently than V8.
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signatureHeader: string | null | undefined,
  secret: string,
): boolean {
  if (!signatureHeader?.startsWith(SIGNATURE_PREFIX)) {
    return false;
  }
  const provided = signatureHeader.slice(SIGNATURE_PREFIX.length);
  const expected = createHmac("sha256", secret)
    .update(typeof payload === "string" ? Buffer.from(payload, "utf8") : payload)
    .digest("hex");
  if (provided.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(provided, "hex"), Buffer.from(expected, "hex"));
}
