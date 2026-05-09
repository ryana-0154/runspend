import { createCustomer } from "@runspend/billing";
import { type Database, organizations } from "@runspend/db";
import { eq } from "drizzle-orm";

/**
 * Return the Stripe customer id for an org, creating it on first use.
 * The first checkout for a given org always lands here; subsequent calls
 * are pure DB reads.
 */
export async function ensureStripeCustomer(
  db: Database,
  org: { id: string; githubLogin: string; stripeCustomerId: string | null },
  email?: string | null,
): Promise<string> {
  if (org.stripeCustomerId) return org.stripeCustomerId;

  const customerId = await createCustomer({
    orgId: org.id,
    githubLogin: org.githubLogin,
    email,
  });
  await db
    .update(organizations)
    .set({ stripeCustomerId: customerId })
    .where(eq(organizations.id, org.id));
  return customerId;
}
