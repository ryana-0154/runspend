import { createHmac } from "node:crypto";
import { verifyWebhookSignature } from "@runspend/github";
import { describe, expect, it } from "vitest";
import { generateInstallState, verifyInstallState } from "@/lib/github/install-state";

const SECRET = "test-secret-1234567890";

function sign(body: string): string {
  return `sha256=${createHmac("sha256", SECRET).update(body).digest("hex")}`;
}

describe("verifyWebhookSignature", () => {
  it("accepts a valid signature", () => {
    const body = '{"action":"created"}';
    expect(verifyWebhookSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const sig = sign('{"action":"created"}');
    expect(verifyWebhookSignature('{"action":"deleted"}', sig, SECRET)).toBe(false);
  });

  it("rejects a missing or malformed header", () => {
    expect(verifyWebhookSignature("body", null, SECRET)).toBe(false);
    expect(verifyWebhookSignature("body", "", SECRET)).toBe(false);
    expect(verifyWebhookSignature("body", "deadbeef", SECRET)).toBe(false);
  });

  it("rejects a wrong secret", () => {
    const body = '{"action":"created"}';
    expect(verifyWebhookSignature(body, sign(body), "wrong-secret")).toBe(false);
  });
});

describe("install state CSRF cookie", () => {
  const ORIGINAL_AUTH_SECRET = process.env.AUTH_SECRET;

  it("verifies a state token tied to the same user", () => {
    process.env.AUTH_SECRET = "csrf-test-secret";
    try {
      const state = generateInstallState("user-abc");
      expect(verifyInstallState(state, "user-abc")).toBe(true);
      expect(verifyInstallState(state, "user-xyz")).toBe(false);
      expect(verifyInstallState(`${state}tampered`, "user-abc")).toBe(false);
      expect(verifyInstallState(null, "user-abc")).toBe(false);
    } finally {
      if (ORIGINAL_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
      else process.env.AUTH_SECRET = ORIGINAL_AUTH_SECRET;
    }
  });
});
