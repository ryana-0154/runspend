import { type Database, organizations, orgMemberships } from "@runspend/db";
import { eq } from "drizzle-orm";

export async function getUserOrgs(db: Database, userId: string) {
  return db
    .select({
      org: organizations,
      role: orgMemberships.role,
    })
    .from(orgMemberships)
    .innerJoin(organizations, eq(orgMemberships.orgId, organizations.id))
    .where(eq(orgMemberships.userId, userId));
}

export async function userHasAnyOrg(db: Database, userId: string): Promise<boolean> {
  const rows = await db
    .select({ id: orgMemberships.id })
    .from(orgMemberships)
    .where(eq(orgMemberships.userId, userId))
    .limit(1);
  return rows.length > 0;
}
