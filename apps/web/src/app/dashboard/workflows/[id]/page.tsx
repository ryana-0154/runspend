import { getDb } from "@runspend/db";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import { CardShell } from "@/components/dashboard/stat-card";
import {
  getWorkflowDetail,
  getWorkflowRuns,
  type WorkflowRunRow,
} from "@/lib/db/dashboard-queries";
import { getUserOrgs } from "@/lib/db/user-orgs";

const NAV = [
  { label: "Overview", href: "/dashboard" },
  { label: "Workflows", href: "/dashboard", active: true },
  { label: "Repositories", href: "/dashboard" },
  { label: "Settings", href: "/dashboard" },
];

const fmtUsd = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDuration = (ms: number | null): string => {
  if (!ms || ms < 0) return "—";
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m < 60) return s ? `${m}m ${s}s` : `${m}m`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m`;
};

const fmtDate = (d: Date | null): string =>
  d
    ? d.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";

const conclusionStyles: Record<string, string> = {
  success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  failure: "bg-rose-500/15 text-rose-700 dark:text-rose-400",
  cancelled: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  skipped: "bg-slate-500/15 text-slate-600 dark:text-slate-400",
  timed_out: "bg-amber-500/15 text-amber-700 dark:text-amber-500",
};

function ConclusionPill({ status, conclusion }: { status: string; conclusion: string | null }) {
  const label = conclusion ?? status;
  const cls = conclusionStyles[label] ?? "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex rounded-md px-2 py-0.5 text-xs font-medium ${cls}`}>
      {label.replace("_", " ")}
    </span>
  );
}

export default async function WorkflowDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const { id } = await params;
  const orgs = await getUserOrgs(getDb(), session.user.id);
  if (orgs.length === 0) redirect("/onboarding/install");

  const orgIds = orgs.map((o) => o.org.id);
  const detail = await getWorkflowDetail(getDb(), id, orgIds);
  if (!detail) notFound();

  const runs = await getWorkflowRuns(getDb(), id, orgIds, 100);
  const totalCost = runs.reduce((acc, r) => acc + r.costUsd, 0);
  const email = session.user.email ?? "unknown";

  return (
    <DashboardShell email={email} nav={NAV}>
      <div>
        <Link
          href="/dashboard"
          className="text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          ← Back to overview
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">{detail.name}</h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {detail.repoName} · {detail.path}
        </p>
      </div>

      <div className="mt-8">
        <CardShell
          title="Recent runs"
          subtitle={`${runs.length} runs · ${fmtUsd(totalCost)} total`}
        >
          {runs.length === 0 ? (
            <p className="px-1 py-12 text-center text-sm text-muted-foreground">
              No runs ingested yet for this workflow.
            </p>
          ) : (
            <RunsTable runs={runs} />
          )}
        </CardShell>
      </div>
    </DashboardShell>
  );
}

function RunsTable({ runs }: { runs: WorkflowRunRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border/60 text-left text-xs font-medium uppercase tracking-wider text-muted-foreground">
            <th className="px-2 py-2">Run</th>
            <th className="px-2 py-2">Status</th>
            <th className="px-2 py-2">Branch</th>
            <th className="px-2 py-2">Actor</th>
            <th className="px-2 py-2">Started</th>
            <th className="px-2 py-2 text-right">Duration</th>
            <th className="px-2 py-2 text-right">Cost</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((run) => (
            <tr key={run.id} className="border-b border-border/30 last:border-0">
              <td className="px-2 py-2 font-mono">#{run.runNumber}</td>
              <td className="px-2 py-2">
                <ConclusionPill status={run.status} conclusion={run.conclusion} />
              </td>
              <td className="px-2 py-2 font-mono text-xs text-muted-foreground">
                {run.headBranch ?? "—"}
              </td>
              <td className="px-2 py-2 text-muted-foreground">{run.actorLogin ?? "—"}</td>
              <td className="px-2 py-2 text-muted-foreground">{fmtDate(run.startedAt)}</td>
              <td className="px-2 py-2 text-right tabular-nums text-muted-foreground">
                {fmtDuration(run.durationMs)}
              </td>
              <td className="px-2 py-2 text-right font-medium tabular-nums">
                {fmtUsd(run.costUsd)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
