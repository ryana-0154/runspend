import { getDb } from "@runspend/db";
import { cookies } from "next/headers";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { userHasAnyOrg } from "@/lib/db/user-orgs";
import {
  generateInstallState,
  INSTALL_STATE_COOKIE,
  installStateCookieOptions,
} from "@/lib/github/install-state";
import { buildInstallUrl } from "@/lib/github/install-url";

async function startInstall() {
  "use server";
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) redirect("/onboarding/install");

  const state = generateInstallState(session.user.id);
  const cookieJar = await cookies();
  cookieJar.set(INSTALL_STATE_COOKIE, state, installStateCookieOptions);

  redirect(buildInstallUrl(slug, state));
}

export default async function InstallPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const userId = session.user.id;
  if (await userHasAnyOrg(getDb(), userId)) {
    redirect("/dashboard");
  }

  const slug = process.env.GITHUB_APP_SLUG;
  if (!slug) {
    return (
      <main className="flex flex-1 items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-sm">
          <div className="flex size-10 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
            <WarnIcon className="size-5" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Setup incomplete</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The RunSpend GitHub App is not configured for this environment. Set{" "}
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-xs">
              GITHUB_APP_SLUG
            </code>{" "}
            in the deployment env to continue.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex flex-1 items-center justify-center overflow-hidden px-6 py-12">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-1/2 h-[520px] w-[920px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-violet-500/10 via-indigo-400/10 to-emerald-300/10 blur-3xl" />
      </div>

      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <Link href="/" className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-md bg-gradient-to-br from-violet-600 to-indigo-600 text-background shadow-sm">
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
            <span className="text-base font-semibold tracking-tight">
              <span className="text-foreground">Run</span>
              <span className="bg-gradient-to-r from-violet-600 to-indigo-600 bg-clip-text text-transparent">
                Spend
              </span>
            </span>
          </Link>
        </div>

        <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
          <ol className="mb-7 flex items-center justify-between text-xs font-medium">
            <Step n={1} label="Sign in" done />
            <StepLine done />
            <Step n={2} label="Install app" active />
            <StepLine />
            <Step n={3} label="Start ingesting" />
          </ol>

          <h1 className="text-2xl font-semibold tracking-tight">
            Connect your GitHub organization
          </h1>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            Install the RunSpend GitHub App on the org you want to analyze. We&apos;ll only read
            workflow run metadata — no source, no logs, no secrets.
          </p>

          <ul className="mt-6 space-y-2.5 text-sm">
            <PermissionRow text="Workflow runs (read)" allowed />
            <PermissionRow text="Repository metadata (read)" allowed />
            <PermissionRow text="Source code, logs, secrets" allowed={false} />
          </ul>

          <form action={startInstall} className="mt-7">
            <button
              type="submit"
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background shadow-sm transition-all hover:opacity-90 active:translate-y-px"
            >
              <GithubMark className="size-4" />
              Install RunSpend on GitHub
            </button>
          </form>

          <p className="mt-4 text-center text-xs text-muted-foreground">
            You&apos;ll be redirected to GitHub to choose an organization.
          </p>
        </div>
      </div>
    </main>
  );
}

function Step({
  n,
  label,
  active,
  done,
}: {
  n: number;
  label: string;
  active?: boolean;
  done?: boolean;
}) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={`flex size-6 items-center justify-center rounded-full text-[11px] font-semibold ${
          done
            ? "bg-emerald-500 text-white"
            : active
              ? "bg-foreground text-background"
              : "bg-muted text-muted-foreground"
        }`}
      >
        {done ? (
          <svg viewBox="0 0 24 24" className="size-3.5" fill="none" aria-hidden>
            <title>icon</title>
            <path
              d="M5 12l5 5L20 7"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        ) : (
          n
        )}
      </span>
      <span
        className={active ? "text-foreground" : done ? "text-foreground" : "text-muted-foreground"}
      >
        {label}
      </span>
    </li>
  );
}

function StepLine({ done }: { done?: boolean }) {
  return <span className={`mx-2 h-px flex-1 ${done ? "bg-emerald-500/50" : "bg-border"}`} />;
}

function PermissionRow({ text, allowed }: { text: string; allowed: boolean }) {
  return (
    <li className="flex items-center gap-2.5">
      {allowed ? (
        <span className="flex size-5 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600">
          <svg viewBox="0 0 24 24" className="size-3" fill="none" aria-hidden>
            <title>icon</title>
            <path
              d="M5 12l5 5L20 7"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      ) : (
        <span className="flex size-5 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <svg viewBox="0 0 24 24" className="size-3" fill="none" aria-hidden>
            <title>icon</title>
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          </svg>
        </span>
      )}
      <span className={allowed ? "text-foreground" : "text-muted-foreground line-through"}>
        {text}
      </span>
    </li>
  );
}

function WarnIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden>
      <title>icon</title>
      <path
        d="M12 9v4m0 4h.01M10.3 3.86l-8.5 14.5A2 2 0 003.5 21h17a2 2 0 001.7-2.64l-8.5-14.5a2 2 0 00-3.4 0z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GithubMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <title>icon</title>
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.92.58.11.79-.25.79-.56v-2c-3.2.7-3.87-1.37-3.87-1.37-.52-1.33-1.27-1.69-1.27-1.69-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.18 1.76 1.18 1.02 1.76 2.69 1.25 3.34.96.1-.74.4-1.25.73-1.54-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.18-3.1-.12-.29-.51-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 015.79 0c2.21-1.49 3.18-1.18 3.18-1.18.62 1.59.23 2.76.11 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.41-5.25 5.7.41.36.78 1.06.78 2.14v3.17c0 .31.21.68.8.56C20.21 21.39 23.5 17.08 23.5 12 23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}
