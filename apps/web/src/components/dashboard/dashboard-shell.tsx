import Link from "next/link";

interface NavItem {
  label: string;
  href: string;
  active?: boolean;
}

export function DashboardShell({
  email,
  nav,
  children,
}: {
  email: string;
  nav: NavItem[];
  children: React.ReactNode;
}) {
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
            {nav.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`inline-flex h-8 items-center rounded-md px-3 text-sm font-medium transition-colors ${
                  n.active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <span className="hidden text-sm text-muted-foreground sm:inline">{email}</span>
            <span className="flex size-8 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-indigo-500 text-sm font-semibold text-white shadow-sm">
              {initial}
            </span>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
