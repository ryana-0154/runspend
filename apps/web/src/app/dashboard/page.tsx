import { getDb } from "@runspend/db";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserOrgs } from "@/lib/db/user-orgs";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await getUserOrgs(getDb(), session.user.id);
  if (orgs.length === 0) redirect("/onboarding/install");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-zinc-600">
        Signed in as <span className="font-mono">{session.user.email ?? "unknown"}</span>
      </p>
      <div className="flex flex-col items-center gap-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
          Connected orgs
        </h2>
        <ul className="flex flex-col gap-1 text-sm">
          {orgs.map(({ org, role }) => (
            <li key={org.id} className="font-mono">
              {org.githubLogin} <span className="text-zinc-500">({role})</span>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
