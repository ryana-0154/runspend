export function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  );
}

export function StatCardSkeleton({ label }: { label: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div className="mt-3 h-9 w-24 animate-pulse rounded bg-muted" />
      <div className="mt-2 h-3 w-32 animate-pulse rounded bg-muted" />
    </div>
  );
}

export function CardShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

export function ChartSkeleton() {
  return <div className="h-64 w-full animate-pulse rounded-md bg-muted/40" />;
}
