import { getDb } from "@runspend/db";
import { logger } from "@runspend/shared";
import { cookies } from "next/headers";
import { type NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { getGithubAppConfig } from "@/lib/github/app-config";
import { completeInstall } from "@/lib/github/install-flow";
import { INSTALL_STATE_COOKIE, verifyInstallState } from "@/lib/github/install-state";
import { kickoffRepoIngest } from "@/lib/queues";

function bad(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function GET(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
  const userId = session.user.id;

  const installationIdParam = req.nextUrl.searchParams.get("installation_id");
  const setupAction = req.nextUrl.searchParams.get("setup_action");
  const state = req.nextUrl.searchParams.get("state");

  if (setupAction === "request") {
    // User went through "Request approval" instead of installing — nothing
    // to do server-side. Show a friendly state.
    return NextResponse.redirect(
      new URL("/onboarding/install?status=requested", req.nextUrl.origin),
    );
  }

  if (!installationIdParam || !/^\d+$/.test(installationIdParam)) {
    return bad("missing or invalid installation_id", 400);
  }
  const installationId = Number.parseInt(installationIdParam, 10);

  const cookieJar = await cookies();
  const cookieState = cookieJar.get(INSTALL_STATE_COOKIE)?.value;
  if (!verifyInstallState(state, userId) || state !== cookieState) {
    logger.warn({ userId, installationId }, "install callback: state cookie did not match");
    return bad("install state did not validate", 400);
  }

  try {
    const result = await completeInstall(
      getDb(),
      getGithubAppConfig(),
      { installationId, userId },
      { kickoffRepoIngest },
    );
    logger.info(
      { userId, installationId, orgId: result.org.id, repoCount: result.repoCount },
      "install callback: org connected",
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const stack = err instanceof Error ? err.stack : undefined;
    logger.error(
      { err, errorMessage: message, errorStack: stack, userId, installationId },
      `install callback: failed — ${message}`,
    );
    return bad("failed to complete installation", 500);
  }

  cookieJar.delete(INSTALL_STATE_COOKIE);
  return NextResponse.redirect(new URL("/dashboard", req.nextUrl.origin));
}
