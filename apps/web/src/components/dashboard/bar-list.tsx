import Link from "next/link";

export interface BarListItem {
  key: string;
  label: string;
  sublabel?: string;
  value: number;
  href?: string;
}

export interface BarListProps {
  items: BarListItem[];
  formatValue: (n: number) => string;
  emptyMessage?: string;
}

export function BarList({ items, formatValue, emptyMessage = "No data yet" }: BarListProps) {
  if (items.length === 0) {
    return <p className="px-1 py-6 text-center text-sm text-muted-foreground">{emptyMessage}</p>;
  }
  const max = Math.max(...items.map((i) => i.value), 0);

  return (
    <ul className="space-y-1.5">
      {items.map((item) => {
        const pct = max > 0 ? (item.value / max) * 100 : 0;
        const inner = (
          <>
            <div
              className="absolute inset-y-0 left-0 rounded-md bg-gradient-to-r from-violet-500/25 to-indigo-500/15"
              style={{ width: `${pct}%` }}
            />
            <div className="relative flex items-center justify-between gap-3 px-3 py-2">
              <div className="min-w-0">
                <div className="truncate font-mono text-sm font-medium text-foreground">
                  {item.label}
                </div>
                {item.sublabel && (
                  <div className="truncate text-xs text-muted-foreground">{item.sublabel}</div>
                )}
              </div>
              <div className="shrink-0 text-sm font-semibold tabular-nums text-foreground">
                {formatValue(item.value)}
              </div>
            </div>
          </>
        );
        return (
          <li key={item.key} className="relative overflow-hidden rounded-md">
            {item.href ? (
              <Link href={item.href} className="block transition-colors hover:bg-muted/40">
                {inner}
              </Link>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ul>
  );
}
