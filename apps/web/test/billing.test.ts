import { randomUUID } from "node:crypto";
import {
  enforceRepoLimit,
  handleStripeWebhook,
  PLAN_REPO_LIMIT,
  resolveAccess,
} from "@runspend/billing";
import { createDb, type Database, organizations, repositories, subscriptions } from "@runspend/db";
import { runMigrations } from "@runspend/db/migrate";
import { eq } from "drizzle-orm";
import postgres from "postgres";
import type Stripe from "stripe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const NOW = new Date("2026-05-01T12:00:00Z");

describe("resolveAccess (pure)", () => {
  it("trial in the future is trial_active with daysLeft", () => {
    const state = resolveAccess({
      org: { plan: "trial", trialEndsAt: new Date("2026-05-08T12:00:00Z") },
      now: NOW,
    });
    expect(state).toEqual({ kind: "trial_active", daysLeft: 7 });
  });

  it("trial with elapsed clock is trial_expired", () => {
    const state = resolveAccess({
      org: { plan: "trial", trialEndsAt: new Date("2026-04-30T12:00:00Z") },
      now: NOW,
    });
    expect(state).toEqual({ kind: "trial_expired" });
  });

  it("trial with null trialEndsAt is trial_expired (defensive)", () => {
    expect(resolveAccess({ org: { plan: "trial", trialEndsAt: null }, now: NOW })).toEqual({
      kind: "trial_expired",
    });
  });

  it("paid plan with active subscription is paid_active", () => {
    expect(
      resolveAccess({
        org: { plan: "growth", trialEndsAt: null },
        subscription: { status: "active" },
        now: NOW,
      }),
    ).toEqual({ kind: "paid_active", plan: "growth" });
  });

  it("paid plan with past_due subscription is paid_past_due (ingest pauses)", () => {
    expect(
      resolveAccess({
        org: { plan: "starter", trialEndsAt: null },
        subscription: { status: "past_due" },
        now: NOW,
      }),
    ).toEqual({ kind: "paid_past_due", plan: "starter" });
  });

  it("paid plan with no subscription row is treated as past_due", () => {
    expect(
      resolveAccess({ org: { plan: "scale", trialEndsAt: null }, subscription: null, now: NOW }),
    ).toEqual({ kind: "paid_past_due", plan: "scale" });
  });

  it("cancelled is always cancelled regardless of subscription status", () => {
    expect(
      resolveAccess({
        org: { plan: "cancelled", trialEndsAt: null },
        subscription: { status: "active" },
        now: NOW,
      }),
    ).toEqual({ kind: "cancelled" });
  });
});

describe("PLAN_REPO_LIMIT", () => {
  it("matches the v1 contract", () => {
    expect(PLAN_REPO_LIMIT).toEqual({
      trial: 5,
      starter: 10,
      growth: 50,
      scale: 250,
      cancelled: 0,
    });
  });
});

const baseUrl = process.env.TEST_DATABASE_URL;
const describeIfDb = baseUrl ? describe : describe.skip;

describeIfDb("billing (DB-backed)", () => {
  let adminClient: ReturnType<typeof postgres> | undefined;
  let testDbName: string;
  let db: Database;

  beforeAll(async () => {
    if (!baseUrl) return;
    testDbName = `runspend_billing_${randomUUID().replace(/-/g, "")}`;
    adminClient = postgres(baseUrl, { max: 1 });
    await adminClient.unsafe(`CREATE DATABASE "${testDbName}"`);
    const url = new URL(baseUrl);
    url.pathname = `/${testDbName}`;
    await runMigrations(url.toString());
    db = createDb(url.toString());
  });

  afterAll(async () => {
    if (!adminClient || !testDbName) return;
    await adminClient.unsafe(
      `SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${testDbName}' AND pid <> pg_backend_pid()`,
    );
    await adminClient.unsafe(`DROP DATABASE IF EXISTS "${testDbName}"`);
    await adminClient.end({ timeout: 5 });
  });

  async function makeOrg(plan: "trial" | "starter" | "growth" | "scale"): Promise<string> {
    const githubOrgId = BigInt(Math.floor(Math.random() * 1_000_000_000));
    const installationId = BigInt(Math.floor(Math.random() * 1_000_000_000));
    const [org] = await db
      .insert(organizations)
      .values({
        githubOrgId,
        githubLogin: `org-${githubOrgId}`,
        installationId,
        plan,
      })
      .returning({ id: organizations.id });
    if (!org) throw new Error("test setup: org insert failed");
    return org.id;
  }

  async function addRepo(
    orgId: string,
    nameSuffix: string,
    lastIngestedRunId: bigint | null,
  ): Promise<string> {
    const githubRepoId = BigInt(Math.floor(Math.random() * 1_000_000_000));
    const [row] = await db
      .insert(repositories)
      .values({
        orgId,
        githubRepoId,
        name: `repo-${nameSuffix}`,
        active: true,
        lastIngestedRunId,
      })
      .returning({ id: repositories.id });
    if (!row) throw new Error("test setup: repo insert failed");
    return row.id;
  }

  describe("enforceRepoLimit", () => {
    it("is a no-op when under the limit", async () => {
      const orgId = await makeOrg("trial");
      await addRepo(orgId, "a", 100n);
      await addRepo(orgId, "b", 200n);
      const result = await enforceRepoLimit(db, orgId);
      expect(result).toEqual({ before: 2, after: 2, deactivated: [] });
    });

    it("deactivates the oldest-ingested repos first to fit under the trial limit", async () => {
      const orgId = await makeOrg("trial");
      // 7 active repos, trial limit is 5 → expect 2 deactivated.
      const ids = await Promise.all([
        addRepo(orgId, "1", 1000n),
        addRepo(orgId, "2", 5n), // oldest
        addRepo(orgId, "3", 800n),
        addRepo(orgId, "4", null), // never ingested → oldest of the oldest
        addRepo(orgId, "5", 600n),
        addRepo(orgId, "6", 200n),
        addRepo(orgId, "7", 4000n),
      ]);
      const result = await enforceRepoLimit(db, orgId);
      expect(result.before).toBe(7);
      expect(result.after).toBe(5);
      expect(result.deactivated).toHaveLength(2);

      // Repos 4 (null) and 2 (run 5) should be deactivated — lowest priority.
      expect(result.deactivated).toContain(ids[3]);
      expect(result.deactivated).toContain(ids[1]);

      // Verify in DB.
      const stillActive = await db
        .select({ id: repositories.id })
        .from(repositories)
        .where(eq(repositories.orgId, orgId));
      const activeIds = stillActive.map((r) => r.id);
      expect(activeIds).toContain(ids[0]);
      expect(activeIds).toContain(ids[6]);
    });

    it("scales the limit with the org plan", async () => {
      const orgId = await makeOrg("starter");
      // 12 active, starter limit is 10 → expect 2 deactivated.
      for (let i = 0; i < 12; i++) await addRepo(orgId, `r${i}`, BigInt(i));
      const result = await enforceRepoLimit(db, orgId);
      expect(result).toMatchObject({ before: 12, after: 10 });
      expect(result.deactivated).toHaveLength(2);
    });

    it("running twice is idempotent", async () => {
      const orgId = await makeOrg("trial");
      for (let i = 0; i < 8; i++) await addRepo(orgId, `r${i}`, BigInt(i));
      await enforceRepoLimit(db, orgId);
      const second = await enforceRepoLimit(db, orgId);
      expect(second).toEqual({ before: 5, after: 5, deactivated: [] });
    });
  });

  describe("handleStripeWebhook", () => {
    function makeSubscriptionEvent(
      type: "customer.subscription.created" | "customer.subscription.updated",
      sub: Partial<Stripe.Subscription> & { id: string; metadata: { org_id: string } },
    ): Stripe.Event {
      return {
        id: `evt_${randomUUID()}`,
        type,
        data: { object: sub as Stripe.Subscription },
      } as Stripe.Event;
    }

    it("ignores events with no org_id metadata", async () => {
      const event = {
        id: "evt_x",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_test",
            metadata: {},
            items: { data: [] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;
      const result = await handleStripeWebhook(db, event);
      expect(result.kind).toBe("ignored");
    });

    it("ignores events with an unknown price id", async () => {
      const orgId = await makeOrg("trial");
      const event = makeSubscriptionEvent("customer.subscription.created", {
        id: `sub_${randomUUID()}`,
        status: "active",
        metadata: { org_id: orgId },
        items: {
          data: [
            {
              id: "si_1",
              price: { id: "price_unknown" } as Stripe.Price,
            } as Stripe.SubscriptionItem,
          ],
        } as Stripe.ApiList<Stripe.SubscriptionItem>,
        current_period_end: Math.floor(Date.now() / 1000) + 86400,
      });
      const result = await handleStripeWebhook(db, event);
      expect(result.kind).toBe("ignored");
    });

    it("ignored events leave org.plan untouched", async () => {
      const orgId = await makeOrg("trial");
      const event = {
        id: "evt_y",
        type: "customer.subscription.created",
        data: {
          object: {
            id: "sub_y",
            metadata: {},
            items: { data: [] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;
      await handleStripeWebhook(db, event);
      const [row] = await db
        .select({ plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, orgId));
      expect(row?.plan).toBe("trial");
    });

    it("subscription.deleted with no metadata is ignored", async () => {
      const event = {
        id: "evt_d",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: "sub_d",
            metadata: {},
            items: { data: [] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;
      const result = await handleStripeWebhook(db, event);
      expect(result.kind).toBe("ignored");
    });

    it("subscription.deleted with a known org cancels and updates plan", async () => {
      const orgId = await makeOrg("growth");
      // Pre-seed a sub row so the cancel update has something to flip.
      const subId = `sub_${randomUUID()}`;
      await db.insert(subscriptions).values({
        orgId,
        stripeSubscriptionId: subId,
        stripePriceId: "price_x",
        plan: "growth",
        status: "active",
      });

      const event = {
        id: "evt_del",
        type: "customer.subscription.deleted",
        data: {
          object: {
            id: subId,
            metadata: { org_id: orgId },
            items: { data: [] },
          } as unknown as Stripe.Subscription,
        },
      } as Stripe.Event;
      const result = await handleStripeWebhook(db, event);
      expect(result.kind).toBe("subscription_canceled");

      const [orgRow] = await db
        .select({ plan: organizations.plan })
        .from(organizations)
        .where(eq(organizations.id, orgId));
      expect(orgRow?.plan).toBe("cancelled");

      const [subRow] = await db
        .select({ status: subscriptions.status })
        .from(subscriptions)
        .where(eq(subscriptions.stripeSubscriptionId, subId));
      expect(subRow?.status).toBe("canceled");
    });
  });
});
