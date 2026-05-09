import { getDb } from "@runspend/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { auth } from "@/auth";
import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import {
  DailySpendSection,
  RunnerOsSection,
  SummaryStats,
  TopReposSection,
  TopWorkflowsSection,
} from "@/components/dashboard/sections";
import { CardShell, ChartSkeleton, StatCardSkeleton } from "@/components/dashboard/stat-card";
import { getUserOrgs } from "@/lib/db/user-orgs";

const NAV = [
  { label: "Overview", href: "/dashboard", active: true },
  { label: "Workflows", href: "/dashboard" },
  { label: "Repositories", href: "/dashboard" },
  { label: "Settings", href: "/dashboard/settings/billing" },
];

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await getUserOrgs(getDb(), session.user.id);
  if (orgs.length === 0) redirect("/onboarding/install");

  const email = session.user.email ?? "unknown";
  const orgIds = orgs.map((o) => o.org.id);

  return (
    <DashboardShell email={email} nav={NAV}>
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your GitHub Actions spend across {orgs.length} connected{" "}
            {orgs.length === 1 ? "organization" : "organizations"}.
          </p>
        </div>
        <Link
          href="/onboarding/install"
          className="inline-flex h-9 items-center justify-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          <PlusIcon className="size-4" />
          Connect another org
        </Link>
      </div>

      <div className="mt-8">
        <Suspense fallback={<SummaryStatsSkeleton />}>
          <SummaryStats orgIds={orgIds} />
        </Suspense>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Suspense
            fallback={
              <CardShell title="Daily spend" subtitle="Last 30 days">
                <ChartSkeleton />
              </CardShell>
            }
          >
            <DailySpendSection orgIds={orgIds} />
          </Suspense>
        </div>
        <Suspense
          fallback={
            <CardShell title="Spend by runner OS" subtitle="Last 30 days">
              <ChartSkeleton />
            </CardShell>
          }
        >
          <RunnerOsSection orgIds={orgIds} />
        </Suspense>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Suspense fallback={<ListSkeleton title="Top workflows" />}>
          <TopWorkflowsSection orgIds={orgIds} />
        </Suspense>
        <Suspense fallback={<ListSkeleton title="Top repositories" />}>
          <TopReposSection orgIds={orgIds} />
        </Suspense>
      </div>

      <section className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Connected organizations
          </h2>
          <span className="text-xs text-muted-foreground">{orgs.length} total</span>
        </div>

        <ul className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
          {orgs.map(({ org, role }, idx) => (
            <li
              key={org.id}
              className={`flex items-center justify-between px-5 py-4 ${
                idx > 0 ? "border-t border-border/60" : ""
              }`}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold uppercase text-foreground">
                  {org.githubLogin.charAt(0)}
                </span>
                <div className="min-w-0">
                  <div className="truncate font-mono text-sm font-medium text-foreground">
                    {org.githubLogin}
                  </div>
                  <div className="text-xs text-muted-foreground">{org.plan} plan</div>
                </div>
              </div>
              <span className="hidden rounded-md bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                {role}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </DashboardShell>
  );
}

function SummaryStatsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <StatCardSkeleton label="Spend (last 30 days)" />
      <StatCardSkeleton label="Minutes used" />
      <StatCardSkeleton label="Active workflows" />
    </div>
  );
}

function ListSkeleton({ title }: { title: string }) {
  return (
    <CardShell title={title} subtitle="Last 30 days">
      <div className="space-y-2">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="h-9 w-full animate-pulse rounded bg-muted/40" />
        ))}
      </div>
    </CardShell>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <title>icon</title>
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
