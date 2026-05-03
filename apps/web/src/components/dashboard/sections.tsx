import { getDb } from "@runspend/db";
import {
  getDailySpend,
  getDashboardSummary,
  getRunnerOsBreakdown,
  getTopRepos,
  getTopWorkflows,
} from "@/lib/db/dashboard-queries";
import { BarList } from "./bar-list";
import { DailySpendChart } from "./daily-spend-chart";
import { RunnerOsDonut } from "./runner-os-donut";
import { CardShell, StatCard } from "./stat-card";

const fmtUsd = (n: number): string =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCount = (n: number): string => n.toLocaleString();

export async function SummaryStats({ orgIds }: { orgIds: string[] }) {
  const summary = await getDashboardSummary(getDb(), orgIds, 30);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCard
        label="Spend (last 30 days)"
        value={fmtUsd(summary.totalSpendUsd)}
        hint={`${fmtCount(summary.runCount)} workflow runs`}
      />
      <StatCard
        label="Minutes used"
        value={fmtCount(summary.totalMinutes)}
        hint="Billable runner minutes"
      />
      <StatCard
        label="Active workflows"
        value={fmtCount(summary.activeWorkflows)}
        hint="With at least one run"
      />
    </div>
  );
}

export async function DailySpendSection({ orgIds }: { orgIds: string[] }) {
  const data = await getDailySpend(getDb(), orgIds, 30);
  const total = data.reduce((acc, d) => acc + d.costUsd, 0);
  return (
    <CardShell title="Daily spend" subtitle={`${fmtUsd(total)} · last 30 days`}>
      {total === 0 ? (
        <p className="px-1 py-12 text-center text-sm text-muted-foreground">
          No spend recorded in the last 30 days.
        </p>
      ) : (
        <DailySpendChart data={data} />
      )}
    </CardShell>
  );
}

export async function TopWorkflowsSection({ orgIds }: { orgIds: string[] }) {
  const rows = await getTopWorkflows(getDb(), orgIds, 30, 10);
  return (
    <CardShell title="Top workflows" subtitle="Last 30 days">
      <BarList
        items={rows.map((r) => ({
          key: r.workflowId,
          label: r.name,
          sublabel: `${r.repoName} · ${fmtCount(r.runCount)} runs`,
          value: r.costUsd,
          href: `/dashboard/workflows/${r.workflowId}`,
        }))}
        formatValue={fmtUsd}
        emptyMessage="No workflow runs ingested yet."
      />
    </CardShell>
  );
}

export async function TopReposSection({ orgIds }: { orgIds: string[] }) {
  const rows = await getTopRepos(getDb(), orgIds, 30, 10);
  return (
    <CardShell title="Top repositories" subtitle="Last 30 days">
      <BarList
        items={rows.map((r) => ({
          key: r.repoId,
          label: r.name,
          sublabel: `${fmtCount(r.runCount)} runs`,
          value: r.costUsd,
        }))}
        formatValue={fmtUsd}
        emptyMessage="No repositories with runs yet."
      />
    </CardShell>
  );
}

export async function RunnerOsSection({ orgIds }: { orgIds: string[] }) {
  const rows = await getRunnerOsBreakdown(getDb(), orgIds, 30);
  const total = rows.reduce((acc, r) => acc + r.costUsd, 0);
  return (
    <CardShell title="Spend by runner OS" subtitle="Last 30 days">
      {total === 0 ? (
        <p className="px-1 py-12 text-center text-sm text-muted-foreground">
          No job-level cost data yet.
        </p>
      ) : (
        <RunnerOsDonut data={rows} />
      )}
    </CardShell>
  );
}
