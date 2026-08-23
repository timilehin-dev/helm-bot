# Quorum v2 — Build Log

This file is the **persistent context** for the automated builder. Each build run reads this
file first to know where the project stands, then appends a new entry at the end when it finishes.

> Rule for the automation: **Always read this file top-to-bottom before writing any code.**
> Append a dated entry on completion. Never delete or rewrite prior entries.

## Project goal

Self-hosted, open-source, $0-to-run alternative to Grok Bot. Bots that *act* (browse, run code,
search, multi-step jobs, 24/7). Users supply only their LLM API key. Council + dissent preserved.

## Tech stack

Vercel (Next.js 15), Inngest, Modal (Python — full agent loop here), Tavily, Redis (Upstash).

## Architecture reference

See `docs/ARCHITECTURE.md`.

## Current status

**Phase 1 complete (Build 1).** Monorepo scaffolded (`apps/web`, `packages/shared`, `modal/`),
Next.js 15.5.23 build green, Inngest client + durable `run-bot` function wired, BYOK encrypted
key store + Redis state + SSE relay in place, Tavily search/extract tool added. See the latest
entry under "Build history" for details and the Phase 2 next steps.

## Build history

<!-- Append new entries below. Format:
## YYYY-MM-DD Build N — <short title>
- **Phase:** <which phase>
- **Delivered:** <measurable, working deliverables>
- **Files:** <key files added/changed>
- **Verified:** <how it was tested / what runs>
- **Next:** <what the next build should tackle>
-->

## 2026-08-23 Build 1 — Phase 1 monorepo scaffold + Inngest + Tavily + Redis + SSE
- **Phase:** 1 (Vercel UI scaffold + Inngest + Tavily + BYOK + Redis + SSE)
- **Delivered:**
  - Restructured legacy v1 repo into a monorepo: root `package.json` (npm workspaces), `apps/web` (Next.js 15), `packages/shared` (dependency-free shared domain types), `modal/` (Phase 2 placeholder).
  - Next.js upgraded 15.2.4 → **15.5.23** (CVE patch); `eslint-config-next` matched.
  - Deps installed: `inngest@3.54`, `ioredis`, `ai` (Vercel AI SDK), `tailwindcss@4`, `react@19`.
  - `packages/shared/src/index.ts` — shared types (`Bot`, `BotRun`, `AgentStep`, `RunPosition`, `Seat`/`SeatRole`, `RunEvent` pub/sub union, `LlmConfig`/`LlmProvider`, `EncryptedPayload`).
  - `apps/web/src/lib/redis.ts` — ioredis client + pub/sub helpers (`publish`, `subscribeToRun`) + key helpers (`runStateKeyFor`, `llmKeyRefFor`, `llmConfigRefFor`); graceful no-op when `REDIS_URL` unset.
  - `apps/web/src/lib/llm-key-store.ts` — AES-GCM encrypted BYOK store (`storeLlmConfig`, `getLlmConfig`) using per-deployment `LLM_KEY_ENCRYPTION_KEY`; plain key only ever returned to Inngest step context.
  - `apps/web/src/inngest/client.ts` — Inngest client (`id: quorum-v2`) with typed `EventSchemas`, `QuorumEvents` enum, `BotRunRequestedData` interface.
  - `apps/web/src/inngest/functions.ts` — durable `run-bot` function (retries: 3) that publishes lifecycle `RunEvent`s to Redis pub/sub; Phase 1 scaffold that Phase 2 swaps for a Modal invocation.
  - `apps/web/src/app/api/inngest/route.ts` — Inngest serve endpoint (`serve({ client: inngest, functions: [runBot] })`).
  - `apps/web/src/app/api/runs/route.ts` — `POST /api/runs` triggers a bot run via `inngest.send({ name: QuorumEvents.BotRunRequested, data })`.
  - `apps/web/src/app/api/runs/[id]/stream/route.ts` — SSE relay subscribing to Redis pub/sub for a run.
  - `apps/web/src/app/api/llm-key/route.ts` — BYOK key storage endpoint (encrypts + stores in Redis).
  - `apps/web/src/lib/tavily.ts` + `apps/web/src/app/api/search/route.ts` — Tavily search (`GET /api/search?q=`) + extract (`POST /api/search { urls }`); uses infra `TAVILY_API_KEY`, degrades to typed "unconfigured" when absent.
  - `.env.example` documenting all infra + BYOK env vars; `.gitignore` fixed for nested workspaces + Python.
- **Files:** `package.json`, `package-lock.json`, `apps/web/package.json`, `apps/web/tsconfig.json`, `packages/shared/*`, `apps/web/src/inngest/*`, `apps/web/src/lib/{redis,llm-key-store,tavily}.ts`, `apps/web/src/app/api/{inngest,runs,runs/[id]/stream,llm-key,search}/route.ts`, `modal/agent.py`, `.env.example`, `.gitignore`, `apps/web/src/lib/convene.ts` (v1 type fix), legacy files relocated under `apps/web/`.
- **Verified:**
  - `npm run build` → ✓ Compiled successfully (Next.js 15.5.23), 8 routes registered (`/`, `/api/chat`, `/api/inngest`, `/api/llm-key`, `/api/runs`, `/api/runs/[id]/stream`, `/api/search`), static pages generated (9/9).
  - `npm run typecheck` (`tsc --noEmit`) → clean, no errors.
  - `npm run lint` → clean except one cosmetic legacy `@next/next/no-page-custom-font` warning in `layout.tsx` (non-blocking).
  - BYOK invariant confirmed by code review: no LLM key is hardcoded; `llmKeyRef` (Redis key) is the only thing carried on the Inngest event, decrypted inside step context.
- **Next:** Phase 2 — implement the Modal Python agent loop (Playwright browse + shell + fs + Tavily + LLM) with a persisted browser profile on a Modal volume; wire the Inngest `run-bot` "run agent" step to invoke it with the decrypted BYOK key. Also consider wiring the Tavily search tool into the council `convene.ts` flow so a Phase-1 bot already gathers real evidence before Modal lands.

