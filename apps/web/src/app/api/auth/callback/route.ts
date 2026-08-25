import { NextRequest, NextResponse } from "next/server";
import {
  authRequired,
  clearStateCookie,
  createSessionToken,
  githubAccessToken,
  githubUser,
  setSessionCookie,
  STATE_COOKIE,
  verifyOAuthState,
} from "@/lib/auth";

/**
 * `GET /api/auth/callback` — OAuth callback.
 *
 * Verifies the state nonce (CSRF guard), exchanges the code for an access token,
 * resolves the GitHub identity, and sets a signed session cookie. The user id
 * derived from the session is `gh_<numeric-id>` — stable and namespaced, never
 * the user's raw profile data.
 */
export async function GET(req: NextRequest) {
  const home = new URL("/", req.nextUrl.origin);
  if (!authRequired()) return NextResponse.redirect(home);

  const next = req.nextUrl;
  const code = next.searchParams.get("code");
  const state = next.searchParams.get("state");

  const err = (msg: string) =>
    NextResponse.redirect(new URL(`/?auth=${encodeURIComponent(msg)}`, req.nextUrl.origin));

  if (!code || !state) return err("missing-params");

  const expected = req.cookies.get(STATE_COOKIE)?.value;
  const nonce = expected ? verifyOAuthState(expected) : null;
  if (!nonce || state !== nonce) return err("invalid-state");

  const accessToken = await githubAccessToken(code, req);
  if (!accessToken) return err("token-failed");

  const gh = await githubUser(accessToken);
  if (!gh) return err("user-failed");

  const token = createSessionToken({
    id: `gh_${gh.id}`,
    login: gh.login,
    name: gh.name ?? undefined,
  });
  if (!token) return err("session-failed");

  const res = NextResponse.redirect(home);
  setSessionCookie(res, token);
  clearStateCookie(res);
  return res;
}