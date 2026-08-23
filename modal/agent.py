"""Quorum v2 Modal agent (Phase 2 placeholder).

The full Python agent loop will live here: Playwright browser + shell + fs +
Tavily + LLM, with the browser profile persisted to a Modal volume so logins
survive across runs. It is invoked by the Inngest durable function in
`apps/web/src/inngest/functions.ts`, which fetches + decrypts the user's BYOK
key and forwards it as an argument — never as an env var.

Phase 1 leaves this as a stub so the monorepo structure matches the
architecture; the next build implements the real agent loop.
"""

__all__: list[str] = []
