import { NextResponse } from "next/server";
import { auth } from "@/auth";

const PUBLIC_PATHS = new Set<string>(["/", "/login", "/api/health"]);
// Webhooks are signature-verified, not session-authed; install callback
// must remain reachable for GitHub's redirect even mid-session.
const PUBLIC_PREFIXES = ["/api/auth/", "/api/webhooks/"];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

export default auth((req) => {
  if (isPublic(req.nextUrl.pathname)) return;
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl.origin);
    return NextResponse.redirect(loginUrl);
  }
});

export const config = {
  // Skip Next internals and static assets; everything else flows through middleware.
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
