import { type Database, users } from "@runspend/db";
import { eq } from "drizzle-orm";

export interface GithubUserUpsertInput {
  githubUserId: bigint;
  email: string;
  name: string | null;
  avatarUrl: string | null;
}

export async function upsertUserFromGithub(db: Database, input: GithubUserUpsertInput) {
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.githubUserId, input.githubUserId))
    .limit(1);

  if (!existing) {
    const [created] = await db
      .insert(users)
      .values({
        githubUserId: input.githubUserId,
        email: input.email,
        name: input.name,
        avatarUrl: input.avatarUrl,
      })
      .returning();
    if (!created) throw new Error("upsertUserFromGithub: insert returned no row");
    return created;
  }

  const [updated] = await db
    .update(users)
    .set({
      email: input.email,
      name: input.name,
      avatarUrl: input.avatarUrl,
      updatedAt: new Date(),
    })
    .where(eq(users.githubUserId, input.githubUserId))
    .returning();
  if (!updated) throw new Error("upsertUserFromGithub: update returned no row");
  return updated;
}
