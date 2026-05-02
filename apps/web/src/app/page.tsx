import Link from "next/link";

export default function Home() {
  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-background">
      <BackgroundGradient />

      <SiteHeader />

      <main className="relative flex flex-1 flex-col">
        <Hero />
        <FeatureGrid />
        <CallToAction />
      </main>

      <SiteFooter />
    </div>
  );
}

function BackgroundGradient() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[640px] overflow-hidden"
    >
      <div className="absolute left-1/2 top-[-120px] h-[520px] w-[920px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-violet-500/15 via-indigo-400/10 to-emerald-300/10 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage:
            "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
    </div>
  );
}

function SiteHeader() {
  return (
    <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5">
      <Link href="/" className="flex items-center gap-2">
        <Logo />
        <span className="text-base font-semibold tracking-tight">
          <span className="text-foreground">Run</span>
          <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Spend</span>
        </span>
      </Link>
      <nav className="hidden items-center gap-7 text-sm text-muted-foreground sm:flex">
        <a href="#features" className="transition-colors hover:text-foreground">
          Features
        </a>
        <a href="#how" className="transition-colors hover:text-foreground">
          How it works
        </a>
        <a
          href="https://github.com"
          className="transition-colors hover:text-foreground"
        >
          GitHub
        </a>
      </nav>
      <div className="flex items-center gap-2">
        <Link
          href="/login"
          className="hidden rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:inline-flex"
        >
          Sign in
        </Link>
        <Link
          href="/login"
          className="inline-flex items-center gap-1.5 rounded-md bg-foreground px-3.5 py-1.5 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90"
        >
          Get started
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section className="relative mx-auto flex w-full max-w-6xl flex-col items-center px-6 pb-20 pt-16 text-center sm:pt-24">
      <div className="inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/60 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
        <span className="size-1.5 rounded-full bg-emerald-500" />
        Now in private beta
      </div>

      <h1 className="mt-7 max-w-3xl text-balance text-4xl font-semibold leading-[1.05] tracking-tight sm:text-6xl">
        See where your{" "}
        <span className="bg-gradient-to-r from-violet-600 to-indigo-500 bg-clip-text text-transparent">
          GitHub Actions
        </span>{" "}
        spend really goes.
      </h1>

      <p className="mt-6 max-w-xl text-pretty text-base leading-relaxed text-muted-foreground sm:text-lg">
        Per-workflow, per-repo, per-branch cost analytics. Connect once and get
        the breakdown your CI bill never gives you — without exposing a single
        log line.
      </p>

      <div className="mt-9 flex flex-col items-center gap-3 sm:flex-row">
        <Link
          href="/login"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-foreground px-5 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90"
        >
          Connect your GitHub org
          <ArrowRight className="size-4" />
        </Link>
        <a
          href="#features"
          className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-background/60 px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
        >
          See what you get
        </a>
      </div>

      <p className="mt-5 text-xs text-muted-foreground">
        Read-only metadata access. No source, no logs, no secrets.
      </p>

      <HeroPreview />
    </section>
  );
}

function HeroPreview() {
  const rows = [
    { repo: "api/server", workflow: "ci.yml", minutes: 4_812, cost: "$192.48", trend: "+12%" },
    { repo: "web/app", workflow: "deploy.yml", minutes: 2_140, cost: "$85.60", trend: "-4%" },
    { repo: "infra/terraform", workflow: "plan.yml", minutes: 1_303, cost: "$52.12", trend: "+38%" },
    { repo: "data/etl", workflow: "nightly.yml", minutes: 980, cost: "$39.20", trend: "+1%" },
  ];

  return (
    <div className="mt-16 w-full max-w-5xl">
      <div className="relative rounded-2xl border border-border bg-card/80 p-2 shadow-2xl shadow-black/5 backdrop-blur">
        <div className="rounded-xl border border-border/80 bg-background">
          <div className="flex items-center justify-between border-b border-border/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="size-2.5 rounded-full bg-rose-400/70" />
              <span className="size-2.5 rounded-full bg-amber-400/70" />
              <span className="size-2.5 rounded-full bg-emerald-400/70" />
            </div>
            <div className="font-mono text-xs text-muted-foreground">
              runspend.app/dashboard

            </div>
            <div className="w-12" />
          </div>

          <div className="grid grid-cols-1 gap-3 p-5 sm:grid-cols-3">
            <StatCard label="Spend this month" value="$369.40" delta="+8.3%" tone="up" />
            <StatCard label="Minutes used" value="9,235" delta="+12.1%" tone="up" />
            <StatCard label="Avg cost / run" value="$0.42" delta="-2.1%" tone="down" />
          </div>

          <div className="overflow-hidden rounded-b-xl border-t border-border/80">
            <div className="grid grid-cols-12 gap-2 px-5 py-2.5 text-left text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              <div className="col-span-4">Repository</div>
              <div className="col-span-3">Workflow</div>
              <div className="col-span-2 text-right">Minutes</div>
              <div className="col-span-2 text-right">Cost</div>
              <div className="col-span-1 text-right">Trend</div>
            </div>
            {rows.map((r) => (
              <div
                key={r.repo + r.workflow}
                className="grid grid-cols-12 items-center gap-2 border-t border-border/60 px-5 py-3 text-sm"
              >
                <div className="col-span-4 truncate font-mono text-foreground">{r.repo}</div>
                <div className="col-span-3 truncate font-mono text-muted-foreground">{r.workflow}</div>
                <div className="col-span-2 text-right tabular-nums text-muted-foreground">
                  {r.minutes.toLocaleString()}
                </div>
                <div className="col-span-2 text-right tabular-nums font-medium">{r.cost}</div>
                <div
                  className={`col-span-1 text-right tabular-nums text-xs ${
                    r.trend.startsWith("-") ? "text-emerald-600" : "text-rose-600"
                  }`}
                >
                  {r.trend}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
  tone,
}: {
  label: string;
  value: string;
  delta: string;
  tone: "up" | "down";
}) {
  return (
    <div className="rounded-lg border border-border/80 bg-card p-4 text-left">
      <div className="text-xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-2 flex items-baseline justify-between">
        <div className="text-2xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div
          className={`text-xs font-medium tabular-nums ${
            tone === "up" ? "text-rose-600" : "text-emerald-600"
          }`}
        >
          {delta}
        </div>
      </div>
    </div>
  );
}

function FeatureGrid() {
  const features = [
    {
      title: "True cost attribution",
      body: "Break spend down by repo, workflow, branch, and runner type. Stop guessing which job is eating your budget.",
      icon: Bars,
    },
    {
      title: "Hosted & self-hosted runners",
      body: "Accurate pricing for GitHub-hosted minutes and visibility into self-hosted runner utilization in one place.",
      icon: Server,
    },
    {
      title: "Read-only by design",
      body: "We only ingest workflow run metadata. No source, no logs, no artifacts ever leave GitHub's servers.",
      icon: Shield,
    },
    {
      title: "Deploy-ready integration",
      body: "Install the GitHub App on an org and start ingesting in under a minute. No agents, no YAML changes.",
      icon: Bolt,
    },
    {
      title: "Idempotent ingest",
      body: "Backfills and webhooks converge to the same state. Replays are safe — your data stays consistent.",
      icon: Refresh,
    },
    {
      title: "Built for teams",
      body: "Multiple orgs, role-based access, and per-tier flat pricing. No surprise per-seat fees.",
      icon: Users,
    },
  ];

  return (
    <section
      id="features"
      className="mx-auto w-full max-w-6xl border-t border-border/60 px-6 py-20"
    >
      <div className="mx-auto max-w-2xl text-center">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          The CI bill, finally explained.
        </h2>
        <p className="mt-4 text-base text-muted-foreground">
          A focused analytics layer over your GitHub Actions usage. Nothing more,
          nothing less.
        </p>
      </div>

      <div className="mt-14 grid grid-cols-1 gap-px overflow-hidden rounded-2xl border border-border/80 bg-border/60 sm:grid-cols-2 lg:grid-cols-3">
        {features.map((f) => (
          <div
            key={f.title}
            className="group flex flex-col gap-3 bg-card p-6 transition-colors hover:bg-card/60"
          >
            <div className="flex size-9 items-center justify-center rounded-lg border border-border/80 bg-background text-muted-foreground transition-colors group-hover:text-foreground">
              <f.icon className="size-4" />
            </div>
            <h3 className="text-sm font-semibold tracking-tight">{f.title}</h3>
            <p className="text-sm leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function CallToAction() {
  return (
    <section id="how" className="mx-auto w-full max-w-6xl px-6 pb-24">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card px-8 py-14 text-center shadow-sm sm:px-14">
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_0%,oklch(0.7_0.18_280/0.12),transparent_60%)]"
        />
        <h2 className="mx-auto max-w-2xl text-balance text-3xl font-semibold tracking-tight sm:text-4xl">
          Ship faster. Spend less. Know exactly why.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-base text-muted-foreground">
          Connect your GitHub org and get a real cost breakdown in minutes.
          Cancel any time — your data is yours.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg bg-foreground px-5 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90"
          >
            Start free
            <ArrowRight className="size-4" />
          </Link>
          <a
            href="mailto:hello@runspend.app"
            className="inline-flex h-11 items-center justify-center rounded-lg border border-border bg-background px-5 text-sm font-medium text-foreground shadow-sm transition-colors hover:bg-muted"
          >
            Talk to us
          </a>
        </div>
      </div>
    </section>
  );
}

function SiteFooter() {
  return (
    <footer className="border-t border-border/60">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 py-8 text-sm text-muted-foreground sm:flex-row">
        <div className="flex items-center gap-2">
          <Logo />
          <span className="font-medium">
            <span className="text-foreground">Run</span>
            <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">Spend</span>
          </span>
          <span className="text-muted-foreground">© {new Date().getFullYear()}</span>
        </div>
        <div className="flex items-center gap-6">
          <a href="#" className="transition-colors hover:text-foreground">
            Privacy
          </a>
          <a href="#" className="transition-colors hover:text-foreground">
            Terms
          </a>
          <a href="#" className="transition-colors hover:text-foreground">
            Status
          </a>
        </div>
      </div>
    </footer>
  );
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`flex size-7 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 text-background shadow-sm ${className}`}
    >
      <svg viewBox="0 0 24 24" fill="none" className="size-4" aria-hidden>
        <path
          d="M4 17l5-5 4 4 7-9"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

type IconProps = { className?: string };

function ArrowRight({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Bars({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path d="M5 20V10M12 20V4M19 20v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Server({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <rect x="3" y="4" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="13" width="18" height="7" rx="2" stroke="currentColor" strokeWidth="2" />
      <path d="M7 7.5h.01M7 16.5h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function Shield({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M12 3l8 3v6c0 4.5-3.2 8.4-8 9-4.8-.6-8-4.5-8-9V6l8-3z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Bolt({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M13 3L4 14h7l-1 7 9-11h-7l1-7z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Refresh({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <path
        d="M4 12a8 8 0 0114-5.3L20 8M20 4v4h-4M20 12a8 8 0 01-14 5.3L4 16M4 20v-4h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Users({ className }: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="2" />
      <path
        d="M2.5 20a6.5 6.5 0 0113 0M16 11a3 3 0 100-6M22 20a5 5 0 00-7-4.6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}
