export type DashboardNavKey = "overview" | "workflows" | "repositories" | "settings";

interface NavSpec {
  key: DashboardNavKey;
  label: string;
  href: string;
}

const SPEC: ReadonlyArray<NavSpec> = [
  { key: "overview", label: "Overview", href: "/dashboard" },
  { key: "workflows", label: "Workflows", href: "/dashboard/workflows" },
  { key: "repositories", label: "Repositories", href: "/dashboard/repositories" },
  { key: "settings", label: "Settings", href: "/dashboard/settings/billing" },
];

/** Single source of truth for the dashboard nav, so every page agrees on links. */
export function dashboardNav(active: DashboardNavKey) {
  return SPEC.map((n) => ({
    label: n.label,
    href: n.href,
    active: n.key === active,
  }));
}
