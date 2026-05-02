import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * CSRF state for the GitHub App install round-trip. Generated when the user
 * clicks "Install on GitHub", verified when the callback fires. We combine
 * a random nonce with the user's id so a stolen state cookie can't be used
 * to attach an installation to someone else's account.
 *
 * Format: <userId>.<nonce>.<hmac>
 *  - hmac = HMAC-SHA256(AUTH_SECRET, `${userId}.${nonce}`)
 */
const COOKIE_NAME = "runspend-install-state";
export const INSTALL_STATE_COOKIE = COOKIE_NAME;
const COOKIE_MAX_AGE_S = 10 * 60; // 10 minutes — install round-trip is quick

function getSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length === 0) {
    throw new Error("AUTH_SECRET is required to sign install state");
  }
  return secret;
}

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

export function generateInstallState(userId: string): string {
  const nonce = randomBytes(16).toString("hex");
  const payload = `${userId}.${nonce}`;
  return `${payload}.${sign(payload, getSecret())}`;
}

export function verifyInstallState(state: string | null | undefined, userId: string): boolean {
  if (!state) return false;
  const parts = state.split(".");
  if (parts.length !== 3) return false;
  const [stateUserId, nonce, mac] = parts;
  if (!stateUserId || !nonce || !mac) return false;
  if (stateUserId !== userId) return false;
  const expected = sign(`${stateUserId}.${nonce}`, getSecret());
  if (mac.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(mac, "hex"), Buffer.from(expected, "hex"));
}

export const installStateCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: COOKIE_MAX_AGE_S,
};
