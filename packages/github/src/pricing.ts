import { type Database, runnerPricing } from "@runspend/db";

export type RunnerOs = "ubuntu" | "windows" | "macos" | "self-hosted";

/**
 * Lookup function returned by `loadRunnerRates`. Resolves a runner_os +
 * optional label to a USD-per-minute rate, falling back to the default rate
 * for that OS (label = null) when the specific label isn't priced.
 *
 * Returns `undefined` when no matching rate row exists at all — callers must
 * decide whether to treat unknown rates as zero, skip the job, or surface a
 * "needs-pricing" warning.
 */
export type RunnerRateLookup = (os: RunnerOs, label?: string | null) => number | undefined;

export async function loadRunnerRates(db: Database): Promise<RunnerRateLookup> {
  const rows = await db
    .select({
      runnerOs: runnerPricing.runnerOs,
      runnerLabel: runnerPricing.runnerLabel,
      perMinuteUsd: runnerPricing.perMinuteUsd,
    })
    .from(runnerPricing);

  const exact = new Map<string, number>();
  const defaults = new Map<RunnerOs, number>();
  for (const row of rows) {
    const rate = Number(row.perMinuteUsd);
    if (row.runnerLabel === null) {
      defaults.set(row.runnerOs, rate);
    } else {
      exact.set(`${row.runnerOs}|${row.runnerLabel}`, rate);
    }
  }

  return (os, label) => {
    if (label) {
      const hit = exact.get(`${os}|${label}`);
      if (hit !== undefined) return hit;
    }
    return defaults.get(os);
  };
}

export function billableMinutes(durationMs: number): number {
  if (durationMs <= 0) return 0;
  return Math.ceil(durationMs / 60_000);
}

export interface JobCostInput {
  runnerOs: RunnerOs;
  runnerLabel?: string | null;
  billableDurationMs: number;
}

export interface JobCostResult {
  billableMinutes: number;
  perMinuteUsd: number;
  costUsd: number;
}

/**
 * Compute the estimated USD cost for a single job. Self-hosted runners always
 * cost zero. Returns `null` when the runner has no priced rate so the caller
 * can flag the job as unpriced rather than silently treating it as free.
 */
export function jobCost(input: JobCostInput, rates: RunnerRateLookup): JobCostResult | null {
  if (input.runnerOs === "self-hosted") {
    return {
      billableMinutes: billableMinutes(input.billableDurationMs),
      perMinuteUsd: 0,
      costUsd: 0,
    };
  }
  const rate = rates(input.runnerOs, input.runnerLabel);
  if (rate === undefined) return null;
  const minutes = billableMinutes(input.billableDurationMs);
  return {
    billableMinutes: minutes,
    perMinuteUsd: rate,
    costUsd: minutes * rate,
  };
}

export function sumRunCost(jobCosts: ReadonlyArray<{ costUsd: number }>): number {
  return jobCosts.reduce((acc, j) => acc + j.costUsd, 0);
}

/** Format a USD amount as the fixed 4-decimal string used in numeric(10,4) columns. */
export function formatCostUsd(n: number): string {
  return n.toFixed(4);
}
