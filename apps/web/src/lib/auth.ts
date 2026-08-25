import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";
import { OPERATOR_ID } from "./operator";

/**
 * Phase 4 auth — signed session cookies + GitHub OAuth.
 *
 * Quorum is self-hosted, so there is no hosted identity layer. When the operator
 * configures GitHub OAuth (GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET + SESSION_SECRET),
 * owner-namespaced routes require a signed session cookie and derive the user id
 * from it — the client never supplies its own identity. When those vars are
 * unset, the app runs in single-operator local mode with a fixed id, preserving
 * the Phase 1–3 demo behaviour without any auth setup.
 *
 * Secrets: the session cookie is an HMAC-SHA256 ("sign, don't encrypt") payload so
 * there is no server-side session store to leak. The user's LLM key is never
 * involved here — this layer only exchanges the OAuth code for a GitHub identity.
 */

export const SESSION_COOKIE = "quorum_session";
export const STATE_COOKIE = "quorum_oauth_state";

const SESSION_TTL = 60 * 60 * 24 * 7; // seconds: 7 days
const STATE_TTL = 60 * 10; // seconds: 10 minutes

/** The fixed owner id used when GitHub auth is not configured. */
export const LOCAL_OPERATOR_ID = OPERATOR_ID;

export interface SessionUser {
  /** Stable, provider-namespaced id (e.g. `gh_12345`). */
  id: string;
  login: string;
  name?: string;
}

interface SessionPayload extends SessionUser {
  exp: number;
}

interface StatePayload {
  s: string;
  exp: number;
}

export type UserResolution =
  | { ok: true; userId: string }
  | { ok: false; error: string; status: number };

function secret(): Buffer | null {
  const raw = process.env.SESSION_SECRET?.trim();
  return raw ? Buffer.from(raw, "utf-8") : null;
}

function b64url(data: string): string {
  return Buffer.from(data, "utf-8").toString("base64url");
}

function b64urlDecode(data: string): string {
  return Buffer.from(data, "base64url").toString("utf-8");
}

function hmac(data: string, key: Buffer): Buffer {
  return createHmac("sha256", key).update(data).digest();
}

/** Serialize a payload into a `payload.signature` token. */
function sign<T extends object>(payload: T, key: Buffer): string {
  const body = b64url(JSON.stringify(payload));
  return `${body}.${hmac(body, key).toString("hex")}`;
}

/** Verify a `payload.signature` token; returns the payload or null. */
function verify<T extends object>(token: string, key: Buffer): T | null {
  const i = token.lastIndexOf(".");
  if (i <= 0) return null;
  const body = token.slice(0, i);
  const sig = token.slice(i + 1);
  const expected = hmac(body, key);
  const actual = Buffer.from(sig, "hex");
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    return null;
  }
  try {
    return JSON.parse(b64urlDecode(body)) as T;
  } catch {
    return null;
  }
}

/** True when GitHub OAuth is fully configured (client id + secret). */
export function authRequired(): boolean {
  return Boolean(
    process.env.GITHUB_CLIENT_ID?.trim() && process.env.GITHUB_CLIENT_SECRET?.trim(),
  );
}

// --- session ---------------------------------------------------------------

/** Sign a session for a GitHub identity; null when SESSION_SECRET is unset. */
export function createSessionToken(user: SessionUser): string | null {
  const key = secret();
  if (!key) return null;
  const payload: SessionPayload = {
    id: user.id,
    login: user.login,
    name: user.name,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL,
  };
  return sign(payload, key);
}

/** Verify a session token into a user; null when invalid/expired/unconfigured. */
export function verifySessionToken(token: string): SessionUser | null {
  const key = secret();
  if (!key) return null;
  const payload = verify<SessionPayload>(token, key);
  if (!payload) return null;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  if (typeof payload.id !== "string" || typeof payload.login !== "string") return null;
  return { id: payload.id, login: payload.login, name: payload.name };
}

/** Read the signed-in user from a request (null when absent/invalid). */
export function readUser(req: NextRequest): SessionUser | null {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  return token ? verifySessionToken(token) : null;
}

// --- OAuth state -----------------------------------------------------------

/** Mint a signed, short-lived nonce for the GitHub authorize redirect. */
export function createOAuthState(): string | null {
  const key = secret();
  if (!key) return null;
  const payload: StatePayload = {
    s: randomBytes(32).toString("hex"),
    exp: Math.floor(Date.now() / 1000) + STATE_TTL,
  };
  return sign(payload, key);
}

/** Verify an OAuth state token; returns the wrapped nonce or null. */
export function verifyOAuthState(token: string): string | null {
  const key = secret();
  if (!key) return null;
  const payload = verify<StatePayload>(token, key);
  if (!payload || typeof payload.s !== "string") return null;
  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }
  return payload.s;
}

// --- owner resolution ------------------------------------------------------

/**
 * Pure owner-resolution core (kept Next-free for direct unit testing):
 * a verified session wins; otherwise GitHub-configured deployments refuse,
 * otherwise local mode falls back to the hint or the fixed local operator.
 */
export function resolveOwner(
  user: SessionUser | null,
  required: boolean,
  hint?: string,
): UserResolution {
  if (user) return { ok: true, userId: user.id };
  if (required) return { ok: false, error: "Authentication required", status: 401 };
  const provided = (hint ?? "").trim();
  return { ok: true, userId: provided || LOCAL_OPERATOR_ID };
}

/** Derive the owner id for a request (session → local-fallback). */
export function resolveUserId(req: NextRequest, hint?: string): UserResolution {
  return resolveOwner(readUser(req), authRequired(), hint);
}

// --- GitHub OAuth ----------------------------------------------------------

export function githubClientId(): string | null {
  return process.env.GITHUB_CLIENT_ID?.trim() || null;
}

export function githubClientSecret(): string | null {
  return process.env.GITHUB_CLIENT_SECRET?.trim() || null;
}

export function githubRedirectUri(req: NextRequest): string {
  const configured = process.env.GITHUB_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${req.nextUrl.origin}/api/auth/callback`;
}

export function githubAuthorizeUrl(req: NextRequest, state: string): string {
  const params = new URLSearchParams({
    client_id: githubClientId() ?? "",
    redirect_uri: githubRedirectUri(req),
    scope: "read:user",
    state,
  });
  return `https://github.com/login/oauth/authorize?${params.toString()}`;
}

/** Exchange an OAuth code for a GitHub access token (null on failure). */
export async function githubAccessToken(
  code: string,
  req: NextRequest,
): Promise<string | null> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      client_id: githubClientId(),
      client_secret: githubClientSecret(),
      code,
      redirect_uri: githubRedirectUri(req),
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string; error?: string };
  return data.access_token ?? null;
}

interface GitHubUser {
  id: number;
  login: string;
  name?: string | null;
}

/** Fetch the authenticated GitHub user (null on failure). */
export async function githubUser(accessToken: string): Promise<GitHubUser | null> {
  const res = await fetch("https://api.github.com/user", {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/vnd.github+json",
      "User-Agent": "quorum-v2",
    },
  });
  if (!res.ok) return null;
  return (await res.json()) as GitHubUser;
}

// --- cookie helpers --------------------------------------------------------

const secure = process.env.NODE_ENV === "production";

export function setSessionCookie(res: NextResponse, token: string): void {
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: SESSION_TTL,
  });
}

export function clearSessionCookie(res: NextResponse): void {
  res.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}

export function setStateCookie(res: NextResponse, token: string): void {
  res.cookies.set(STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: STATE_TTL,
  });
}

export function clearStateCookie(res: NextResponse): void {
  res.cookies.set(STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure,
    path: "/",
    maxAge: 0,
  });
}