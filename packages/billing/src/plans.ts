export type Plan = "trial" | "starter" | "growth" | "scale" | "cancelled";

export const PLAN_REPO_LIMIT: Record<Plan, number> = {
  trial: 5,
  starter: 10,
  growth: 50,
  scale: 250,
  cancelled: 0,
};

export const TRIAL_DAYS = 14;

export type PaidPlan = Exclude<Plan, "trial" | "cancelled">;

export function repoLimit(plan: Plan): number {
  return PLAN_REPO_LIMIT[plan];
}

// Read STRIPE_PRICE_* directly from process.env so tests that exercise
// the webhook handler (which calls planForPriceId) don't need the full
// app env schema (DATABASE_URL, AUTH_SECRET, etc.) to be valid.
function priceEnv(plan: PaidPlan): string | undefined {
  if (plan === "starter") return process.env.STRIPE_PRICE_STARTER;
  if (plan === "growth") return process.env.STRIPE_PRICE_GROWTH;
  return process.env.STRIPE_PRICE_SCALE;
}

export function priceIdForPlan(plan: PaidPlan): string {
  const id = priceEnv(plan);
  if (!id) throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} is not configured`);
  return id;
}

export function planForPriceId(priceId: string): PaidPlan | null {
  if (priceId === process.env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === process.env.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === process.env.STRIPE_PRICE_SCALE) return "scale";
  return null;
}
