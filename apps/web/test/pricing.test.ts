import { randomUUID } from "node:crypto";
import { createDb, type Database } from "@runspend/db";
import { runMigrations } from "@runspend/db/migrate";
import {
  billableMinutes,
  formatCostUsd,
  jobCost,
  loadRunnerRates,
  type RunnerRateLookup,
  sumRunCost,
} from "@runspend/github";
import postgres from "postgres";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("billableMinutes", () => {
  it("rounds up to the nearest minute", () => {
    expect(billableMinutes(0)).toBe(0);
    expect(billableMinutes(1)).toBe(1);
    expect(billableMinutes(59_999)).toBe(1);
    expect(billableMinutes(60_000)).toBe(1);
    expect(billableMinutes(60_001)).toBe(2);
    expect(billableMinutes(125_000)).toBe(3);
  });

  it("treats negative or zero durations as zero", () => {
    expect(billableMinutes(-1)).toBe(0);
    expect(billableMinutes(0)).toBe(0);
  });
});

describe("jobCost", () => {
  const stubRates: RunnerRateLookup = (os, label) => {
    if (label === "ubuntu-4-core") return 0.032;
    if (os === "ubuntu") return 0.008;
    if (os === "windows") return 0.016;
    if (os === "macos") return 0.08;
    return undefined;
  };

  it("multiplies rounded-up minutes by the per-OS rate", () => {
    const r = jobCost({ runnerOs: "ubuntu", billableDurationMs: 90_000 }, stubRates);
    expect(r).not.toBeNull();
    expect(r?.billableMinutes).toBe(2);
    expect(r?.perMinuteUsd).toBe(0.008);
    expect(r?.costUsd).toBeCloseTo(0.016, 6);
  });

  it("prefers a label-specific rate over the default", () => {
    const r = jobCost(
      { runnerOs: "ubuntu", runnerLabel: "ubuntu-4-core", billableDurationMs: 60_000 },
      stubRates,
    );
    expect(r?.perMinuteUsd).toBe(0.032);
  });

  it("falls back to the default OS rate when label has no specific rate", () => {
    const r = jobCost(
      { runnerOs: "ubuntu", runnerLabel: "ubuntu-latest", billableDurationMs: 60_000 },
      stubRates,
    );
    expect(r?.perMinuteUsd).toBe(0.008);
  });

  it("returns zero cost for self-hosted regardless of duration", () => {
    const r = jobCost({ runnerOs: "self-hosted", billableDurationMs: 600_000 }, stubRates);
    expect(r?.costUsd).toBe(0);
    expect(r?.billableMinutes).toBe(10);
  });

  it("returns null when the runner has no priced rate", () => {
    const noRates: RunnerRateLookup = () => undefined;
    const r = jobCost({ runnerOs: "ubuntu", billableDurationMs: 60_000 }, noRates);
    expect(r).toBeNull();
  });
});

describe("sumRunCost", () => {
  it("sums job costs", () => {
    expect(sumRunCost([{ costUsd: 0.016 }, { costUsd: 0.024 }, { costUsd: 0 }])).toBeCloseTo(
      0.04,
      6,
    );
  });

  it("returns zero for an empty run", () => {
    expect(sumRunCost([])).toBe(0);
  });
});

describe("formatCostUsd", () => {
  it("formats to four decimal places", () => {
    expect(formatCostUsd(0.016)).toBe("0.0160");
    expect(formatCostUsd(1)).toBe("1.0000");
    expect(formatCostUsd(0.00001)).toBe("0.0000");
  });
});

const baseUrl = process.env.TEST_DATABASE_URL;
const describeIfDb = baseUrl ? describe : describe.skip;

let adminClient: ReturnType<typeof postgres> | undefined;
let testDbName: string | undefined;
let db: Database;

describeIfDb("loadRunnerRates (DB-backed)", () => {
  beforeAll(async () => {
    if (!baseUrl) return;
    testDbName = `runspend_pricing_${randomUUID().replace(/-/g, "")}`;
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

  it("loads the seeded standard runner rates", async () => {
    const rates = await loadRunnerRates(db);
    expect(rates("ubuntu")).toBe(0.008);
    expect(rates("windows")).toBe(0.016);
    expect(rates("macos")).toBe(0.08);
    expect(rates("self-hosted")).toBe(0);
  });

  it("falls back to the default OS rate for an unknown label", async () => {
    const rates = await loadRunnerRates(db);
    expect(rates("ubuntu", "ubuntu-latest")).toBe(0.008);
    expect(rates("ubuntu", "ubuntu-22.04")).toBe(0.008);
  });
});
