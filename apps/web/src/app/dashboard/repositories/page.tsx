import { getDb } from "@runspend/db";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CardShell } from "@/components/dashboard/stat-card";
import { getAllRepositories, type RepositoryListRow } from "@/lib/db/dashboard-queries";
import { getUserOrgs } from "@/lib/db/user-orgs";
import { dashboardNav } from "@/lib/nav";

const fmtUsd = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtRelative = (d: Date | null): string => {
  if (!d) return "—";
  const ms = Date.now() - d.getTime();
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
};

export default async function RepositoriesPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const db = getDb();
  const orgs = await getUserOrgs(db, session.user.id);
  if (orgs.length === 0) redirect("/onboarding/install");

  const orgIds = orgs.map((o) => o.org.id);
  const repos = await getAllRepositories(db, orgIds);
  const activeCount = repos.filter((r) => r.active).length;
  const totalCost = repos.reduce((acc, r) => acc + r.costUsd, 0);
  const email = session.user.email ?? "unknown";

  return (
    <DashboardShell email={email} nav={dashboardNav("repositories")}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Repositories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {repos.length === 0
            ? "No repositories connected yet."
            : `${activeCount} active of ${repos.length} · ${fmtUsd(totalCost)} over the last 30 days`}
        </p>
      </div>

      <div className="mt-8">
        <CardShell title="All repositories" subtitle="Sorted by spend">
          {repos.length === 0 ? (
            <p className="px-1 py-12 text-center text-sm text-muted-foreground">
              The GitHub App hasn't returned any repositories for your installations.
            </p>
          ) : (
            <RepositoriesTable rows={repos} />
          )}
        </CardShell>
      </div>
    </DashboardShell>
  );
}

function RepositoriesTable({ rows }: { rows: RepositoryListRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2">Repository</th>
            <th className="px-2 py-2">Visibility</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2 text-right">Runs</th>
            <th className="px-2 py-2 text-right">Last run</th>
            <th className="px-2 py-2 text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.repoId} className="border-b border-border/30 last:border-0">
              <td className="px-2 py-2 font-mono">{r.name}</td>
              <td className="px-2 py-2 text-xs text-muted-foreground">
                {r.isPrivate ? "Private" : "Public"}
              </td>
              <td className="px-2 py-2">
                <span
                  className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${
                    r.active
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                      : "bg-slate-500/15 text-slate-600 dark:text-slate-400"
                  }`}
                >
                  {r.active ? "active" : "inactive"}
                </span>
              </td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                {r.runCount.toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                {fmtRelative(r.lastRunAt)}
              </td>
              <td className="px-2 py-2 text-right font-medium tabular-nums">{fmtUsd(r.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
