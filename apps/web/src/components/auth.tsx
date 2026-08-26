"use client";

import { useAuth } from "@/lib/auth-context";

/**
 * Sign-in gate (Phase 4).
 *
 * When GitHub OAuth is configured and there is no session, this full-screen gate
 * blocks the chamber until the operator signs in. When auth is not configured
 * (local single-operator mode), the gate renders nothing — the Phase 1–3 demo
 * behaviour is unchanged.
 */
export function SignInGate() {
  const { loading, required, user, signIn } = useAuth();

  if (loading || !required || user) return null;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-bg/90 p-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-surface p-6 text-center">
        <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
          Sign in
        </p>
        <h1 className="font-display mt-2 text-2xl tracking-tight">Quorum</h1>
        <p className="mt-2 text-sm text-muted">
          This instance requires a GitHub sign-in before the chamber opens.
        </p>
        <button
          type="button"
          onClick={signIn}
          className="mt-6 h-11 w-full rounded-md bg-accent text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Continue with GitHub
        </button>
      </div>
    </div>
  );
}

/**
 * Compact sign-in/sign-out control surfaced in the shell chrome.
 *
 * In local mode (auth not required) this is a no-op button, so the UI stays
 * coherent without forcing any auth setup. In authed mode it shows the signed-in
 * login (or a "Sign in" button) and a sign-out action.
 */
export function AuthButton() {
  const { loading, required, user, signIn, signOut } = useAuth();

  if (loading || !required) return null;

  return (
    <div className="flex items-center gap-2">
      {user ? (
        <>
          <span className="truncate font-mono text-[11px] text-muted">
            @{user.login}
          </span>
          <button
            type="button"
            onClick={signOut}
            className="h-7 rounded-md border border-border px-2.5 text-[11px] text-muted hover:text-fg"
          >
            Sign out
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={signIn}
          className="h-7 rounded-md bg-accent px-2.5 text-[11px] font-medium text-accent-fg hover:opacity-90"
        >
          Sign in
        </button>
      )}
    </div>
  );
}
