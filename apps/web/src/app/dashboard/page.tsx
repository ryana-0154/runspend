import { getDb } from "@runspend/db";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getUserOrgs } from "@/lib/db/user-orgs";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const orgs = await getUserOrgs(getDb(), session.user.id);
  if (orgs.length === 0) redirect("/onboarding/install");

  const email = session.user.email ?? "unknown";
  const initial = email.charAt(0).toUpperCase();

  return (
    <div className="flex flex-1 flex-col bg-background">
      <header className="border-b border-border/80 bg-background/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3.5">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 text-background shadow-sm">
              <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
                <title>icon</title>
                <path
                  d="M4 17l5-5 4 4 7-9"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span className="text-sm font-semibold tracking-tight">
              <span className="text-foreground">Run</span>
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Spend
              </span>
            </span>
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            <NavTab label="Overview" active />
            <NavTab label="Workflows" />
            <NavTab label="Repositories" />
            <NavTab label="Settings" />
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
            <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-semibold text-white shadow-sm">
              {initial}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">
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

        <div className="mt-8 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Spend this month" value="—" hint="Awaiting first ingest" />
          <StatCard label="Minutes used" value="—" hint="Awaiting first ingest" />
          <StatCard label="Active workflows" value="—" hint="Awaiting first ingest" />
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
                <div className="flex items-center gap-3 min-w-0">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold uppercase text-foreground">
                    {org.githubLogin.charAt(0)}
                  </span>
                  <div className="min-w-0">
                    <div className="font-mono text-sm font-medium text-foreground truncate">
                      {org.githubLogin}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Connected · awaiting first sync
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-0.5 text-xs font-medium text-muted-foreground">
                    <span className="size-1.5 rounded-full bg-amber-500" />
                    Pending
                  </span>
                  <span className="hidden rounded-md bg-muted px-2 py-0.5 text-xs font-medium uppercase tracking-wide text-muted-foreground sm:inline">
                    {role}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-10">
          <div className="rounded-2xl border border-dashed border-border bg-card/40 p-10 text-center">
            <div className="mx-auto flex size-10 items-center justify-center rounded-lg bg-muted text-muted-foreground">
              <ChartIcon className="size-5" />
            </div>
            <h3 className="mt-4 text-base font-semibold tracking-tight">No data yet</h3>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted-foreground">
              We&apos;ll start ingesting workflow runs as soon as your first webhook arrives. This
              usually takes less than a minute.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

function NavTab({ label, active }: { label: string; active?: boolean }) {
  return (
    <span
      className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors ${
        active ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </span>
  );
}

function StatCard({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
    </div>
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

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <title>icon</title>
      <path
        d="M4 20V10M10 20V4M16 20v-7M22 20H2"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
