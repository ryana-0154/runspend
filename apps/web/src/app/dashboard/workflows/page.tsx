import { getDb } from "@runspend/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CardShell } from "@/components/dashboard/stat-card";
import { getAllWorkflows, type WorkflowListRow } from "@/lib/db/dashboard-queries";
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

export default async function WorkflowsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const db = getDb();
  const orgs = await getUserOrgs(db, session.user.id);
  if (orgs.length === 0) redirect("/onboarding/install");

  const orgIds = orgs.map((o) => o.org.id);
  const workflows = await getAllWorkflows(db, orgIds);
  const totalCost = workflows.reduce((acc, w) => acc + w.costUsd, 0);
  const email = session.user.email ?? "unknown";

  return (
    <DashboardShell email={email} nav={dashboardNav("workflows")}>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Workflows</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {workflows.length === 0
            ? "Last 30 days"
            : `${workflows.length} workflows · ${fmtUsd(totalCost)} over the last 30 days`}
        </p>
      </div>

      <div className="mt-8">
        <CardShell title="All workflows" subtitle="Sorted by spend">
          {workflows.length === 0 ? (
            <p className="px-1 py-12 text-center text-sm text-muted-foreground">
              No workflow runs ingested in the last 30 days. Push a commit or wait for the hourly
              backfill to populate this view.
            </p>
          ) : (
            <WorkflowsTable rows={workflows} />
          )}
        </CardShell>
      </div>
    </DashboardShell>
  );
}

function WorkflowsTable({ rows }: { rows: WorkflowListRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2">Workflow</th>
            <th className="px-2 py-2">Repository</th>
            <th className="px-2 py-2 text-right">Runs</th>
            <th className="px-2 py-2 text-right">Last run</th>
            <th className="px-2 py-2 text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((w) => (
            <tr key={w.workflowId} className="border-b border-border/30 last:border-0">
              <td className="px-2 py-2">
                <Link
                  href={`/dashboard/workflows/${w.workflowId}`}
                  className="font-medium text-foreground hover:underline"
                >
                  {w.name}
                </Link>
                <div className="font-mono text-xs text-muted-foreground">{w.path}</div>
              </td>
              <td className="px-2 py-2 font-mono text-xs text-muted-foreground">{w.repoName}</td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                {w.runCount.toLocaleString()}
              </td>
              <td className="px-2 py-2 text-right text-xs text-muted-foreground">
                {fmtRelative(w.lastRunAt)}
              </td>
              <td className="px-2 py-2 text-right font-medium tabular-nums">{fmtUsd(w.costUsd)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
