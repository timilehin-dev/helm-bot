import { NextRequest, NextResponse } from "next/server";
import {
  authRequired,
  createOAuthState,
  githubAuthorizeUrl,
  githubClientId,
  setStateCookie,
} from "@/lib/auth";

/**
 * `GET /api/auth/login` — begin GitHub OAuth.
 *
 * Mints a signed, short-lived nonce in an httpOnly cookie and redirects to GitHub.
 * When GitHub auth is unset (local mode), redirects back to `/` so the UI's
 * sign-in affordance is a no-op rather than a dead link.
 */
export async function GET(req: NextRequest) {
  if (!authRequired()) {
    return NextResponse.redirect(new URL("/", req.nextUrl.origin));
  }
  const state = createOAuthState();
  if (!state || !githubClientId()) {
    return NextResponse.redirect(new URL("/?auth=misconfigured", req.nextUrl.origin));
  }
  const res = NextResponse.redirect(githubAuthorizeUrl(req, state));
  setStateCookie(res, state);
  return res;
}