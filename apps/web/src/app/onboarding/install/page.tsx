import { getDb } from "@runspend/db";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { userHasAnyOrg } from "@/lib/db/user-orgs";
import {
  generateInstallState,
  INSTALL_STATE_COOKIE,
  installStateCookieOptions,
} from "@/lib/github/install-state";
import { buildInstallUrl } from "@/lib/github/install-url";

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
      <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8">
        <h1 className="text-2xl font-semibold">Setup incomplete</h1>
        <p className="max-w-md text-center text-sm text-zinc-600">
          The runspend GitHub App is not configured for this environment. Set
          <code className="ml-1 rounded bg-zinc-100 px-1 py-0.5 font-mono text-xs">
            GITHUB_APP_SLUG
          </code>{" "}
          in the deployment env to continue.
        </p>
      </main>
    );
  }

  const state = generateInstallState(userId);
  const cookieJar = await cookies();
  cookieJar.set(INSTALL_STATE_COOKIE, state, installStateCookieOptions);

  const installUrl = buildInstallUrl(slug, state);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8">
      <h1 className="text-2xl font-semibold">Connect your GitHub organization</h1>
      <p className="max-w-md text-center text-sm text-zinc-600">
        Install the runspend GitHub App on the org you want to analyze. We&apos;ll only read
        workflow run metadata — no source, no logs, no secrets.
      </p>
      <a
        href={installUrl}
        className="rounded-md bg-black px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800"
      >
        Install runspend on GitHub
      </a>
    </main>
  );
}
