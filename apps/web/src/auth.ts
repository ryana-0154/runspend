import { getDb, users } from "@runspend/db";
import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import { upsertUserFromGithub } from "@/lib/auth/upsert-user";

function readGithubProfile(profile: unknown): {
  githubUserId: bigint;
  email: string;
  name: string | null;
  avatarUrl: string | null;
} | null {
  if (!profile || typeof profile !== "object") return null;
  const p = profile as Record<string, unknown>;
  const id = p.id;
  const email = p.email;
  if (typeof id !== "number" && typeof id !== "string") return null;
  if (typeof email !== "string" || email.length === 0) return null;
  return {
    githubUserId: BigInt(id),
    email,
    name: typeof p.name === "string" ? p.name : null,
    avatarUrl: typeof p.avatar_url === "string" ? p.avatar_url : null,
  };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  callbacks: {
    async signIn({ profile }) {
      const parsed = readGithubProfile(profile);
      if (!parsed) return false;
      await upsertUserFromGithub(getDb(), parsed);
      return true;
    },
    async jwt({ token, profile }) {
      const parsed = readGithubProfile(profile);
      if (parsed) {
        const [u] = await getDb()
          .select()
          .from(users)
          .where(eq(users.githubUserId, parsed.githubUserId))
          .limit(1);
        if (u) {
          token.userId = u.id;
          token.email = u.email;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (typeof token.userId === "string") {
        session.user.id = token.userId;
      }
      if (typeof token.email === "string") {
        session.user.email = token.email;
      }
      return session;
    },
  },
});
