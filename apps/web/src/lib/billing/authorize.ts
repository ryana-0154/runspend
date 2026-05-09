import { type Database, organizations, orgMemberships } from "@runspend/db";
import { and, eq } from "drizzle-orm";

/**
 * Confirm the user is an owner of the org. Billing actions (start checkout,
 * open portal) must be owner-only — members shouldn't be able to add a card
 * to an org they only have read access to.
 */
export async function loadOrgIfOwner(
  db: Database,
  userId: string,
  orgId: string,
): Promise<typeof organizations.$inferSelect | null> {
  const [row] = await db
    .select({ org: organizations })
    .from(orgMemberships)
    .innerJoin(organizations, eq(organizations.id, orgMemberships.orgId))
    .where(
      and(
        eq(orgMemberships.userId, userId),
        eq(orgMemberships.orgId, orgId),
        eq(orgMemberships.role, "owner"),
      ),
    )
    .limit(1);
  return row?.org ?? null;
}
