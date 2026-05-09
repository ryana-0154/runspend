import { getEnv } from "@runspend/shared";

export function billingEnabled(): boolean {
  return getEnv().BILLING_ENABLED;
}
