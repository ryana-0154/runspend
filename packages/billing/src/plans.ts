import { getEnv } from "@runspend/shared";

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

export function priceIdForPlan(plan: PaidPlan): string {
  const env = getEnv();
  const id =
    plan === "starter"
      ? env.STRIPE_PRICE_STARTER
      : plan === "growth"
        ? env.STRIPE_PRICE_GROWTH
        : env.STRIPE_PRICE_SCALE;
  if (!id) throw new Error(`STRIPE_PRICE_${plan.toUpperCase()} is not configured`);
  return id;
}

export function planForPriceId(priceId: string): PaidPlan | null {
  const env = getEnv();
  if (priceId === env.STRIPE_PRICE_STARTER) return "starter";
  if (priceId === env.STRIPE_PRICE_GROWTH) return "growth";
  if (priceId === env.STRIPE_PRICE_SCALE) return "scale";
  return null;
}
