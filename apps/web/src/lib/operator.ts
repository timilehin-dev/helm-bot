/**
 * Operator identity fallback for single-operator (local) mode.
 *
 * When Phase 4 GitHub auth is unconfigured, the app runs as a single local
 * operator. The client sends this value as a `userId` hint; `@/lib/auth` ignores
 * that hint whenever a signed session is present and otherwise falls back to
 * exactly this value. Kept dependency-free so client components can import it
 * without pulling server-only crypto into the browser bundle.
 */
export const OPERATOR_ID = "local";
