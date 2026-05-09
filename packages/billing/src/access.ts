import type { Organization, Subscription } from "@runspend/db";

export type AccessState =
  | { kind: "trial_active"; daysLeft: number }
  | { kind: "trial_expired" }
  | { kind: "paid_active"; plan: Organization["plan"] }
  | { kind: "paid_past_due"; plan: Organization["plan"] }
  | { kind: "cancelled" };

export interface AccessInputs {
  org: Pick<Organization, "plan" | "trialEndsAt">;
  subscription?: Pick<Subscription, "status"> | null;
  /** Injected for tests; defaults to `new Date()`. */
  now?: Date;
}

/**
 * Resolve an org's current billing access state. Trial is implied by
 * `org.plan === 'trial'` + the `trial_ends_at` clock; paid plans defer to
 * the latest subscription row's status. We treat any non-active subscription
 * status (canceled, unpaid, incomplete, paused, past_due) as a soft block —
 * dashboard remains read-only, but ingest pauses.
 */
export function resolveAccess(input: AccessInputs): AccessState {
  const now = input.now ?? new Date();

  if (input.org.plan === "cancelled") return { kind: "cancelled" };

  if (input.org.plan === "trial") {
    const ends = input.org.trialEndsAt;
    if (!ends || ends.getTime() <= now.getTime()) return { kind: "trial_expired" };
    const daysLeft = Math.max(0, Math.ceil((ends.getTime() - now.getTime()) / 86_400_000));
    return { kind: "trial_active", daysLeft };
  }

  // Paid plan path. Without a subscription row we conservatively treat the
  // org as past_due — webhook should populate this on first checkout.
  const status = input.subscription?.status;
  if (status === "active" || status === "trialing") {
    return { kind: "paid_active", plan: input.org.plan };
  }
  return { kind: "paid_past_due", plan: input.org.plan };
}

/**
 * True iff ingest should keep running for this org. Used by webhook fast-path
 * (skip enqueue) and by worker job processors (skip job).
 */
export function ingestAllowed(state: AccessState): boolean {
  return state.kind === "trial_active" || state.kind === "paid_active";
}
