"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Client-side auth context (Phase 4).
 *
 * Bootstraps the session by calling `GET /api/auth/me`, which returns the
 * resolved user id (or the local-mode fallback) plus whether GitHub OAuth is
 * required. Components read `userId` from here instead of hardcoding the local
 * operator id, so owner-namespaced API calls carry the correct session identity.
 */

export interface AuthUser {
  id: string;
  login: string;
  name?: string;
}

interface AuthState {
  /** True until the initial `/api/auth/me` call resolves. */
  loading: boolean;
  /** True when GitHub OAuth is configured (owner-namespaced routes require auth). */
  required: boolean;
  /** The signed-in user, or null (either signed out or local mode). */
  user: AuthUser | null;
  /**
   * The id to namespace reads/writes under. Always present once loaded:
   * `gh_<id>` when signed in, otherwise the local fallback (or null when auth
   * is required and there is no session).
   */
  userId: string | null;
  signIn: () => void;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);

type MeResponse = {
  ok: boolean;
  required: boolean;
  user: AuthUser | null;
  userId: string | null;
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [required, setRequired] = useState(false);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? (res.json() as Promise<MeResponse>) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setRequired(Boolean(data.required));
        setUser(data.user);
        setUserId(data.userId);
      })
      .catch(() => {
        // Keep local mode usable even if the /me endpoint is unavailable.
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(() => {
    window.location.assign("/api/auth/login");
  }, []);

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.assign("/");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ loading, required, user, userId, signIn, signOut }),
    [loading, required, user, userId, signIn, signOut],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
