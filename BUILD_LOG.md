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

## 2026-08-23 Build 2 — Phase 2 Modal agent loop + Inngest→Modal BYOK invocation
- **Phase:** 2 (Modal computer — full Python agent loop + persisted browser profile)
- **Delivered:**
  - Full Python agent loop under `modal/quorum/`: `agent.py` (plan → acting seats run tools → chair seals verdict + records dissent), `llm.py` (BYOK OpenAI-compatible + Anthropic chat via stdlib `urllib`, zero third-party HTTP deps), `seats.py` (canonical SEATS + `resolve_seats`), `stream.py` (Redis pub/sub `Streamer` with offline no-op + `RecordingPublisher`), `tools.py` (`ShellTool`, `FsTool`, `TavilyTool`, `Browser` protocol), `types.py` (`RunRequest`/`RunResult`/`Position`/`Seat`/`ToolOutcome`).
  - `modal/agent.py`: deployable Modal `web_endpoint` (`POST /run`) with a `PlaywrightBrowser` adapter using `launch_persistent_context` on the `quorum-browser-profiles` volume (logins persist), `quorum-agent` Modal Secret for infra tokens, 15 min timeout, 4 concurrent inputs.
  - `apps/web/src/lib/modal.ts`: `invokeModalAgent` + typed `ModalRunResponse` discriminated union; graceful "unconfigured" path when `MODAL_AGENT_URL` unset.
  - `apps/web/src/inngest/functions.ts`: decrypted BYOK key in-step, invoked Modal over HTTPS, relays `run:failed`/`run:sealed` lifecycle markers; `packages/shared` canonical `SEATS` (5 acting seats incl. adversary) now the single source of truth shared by UI/Inngest/Modal; `POST /api/runs` accepts `seats`/`chairId` with sane defaults.
  - `.env.example` (with `MODAL_AGENT_URL`) un-ignored; `.gitignore` covers Python artifacts (`__pycache__`, `.pytest_cache`, `*.egg-info`).
- **Files:** `modal/quorum/*`, `modal/agent.py`, `modal/pyproject.toml`, `modal/tests/test_agent.py`, `apps/web/src/lib/modal.ts`, `apps/web/src/inngest/functions.ts`, `apps/web/src/inngest/client.ts`, `apps/web/src/lib/llm-key-store.ts`, `apps/web/src/app/api/runs/route.ts`, `packages/shared/src/index.ts`, `.env.example`, `.gitignore`.
- **Verified:**
  - `modal: python3 -m pytest -q` → **11 passed** (agent loop end-to-end incl. dissent, LLM exception handling, shell/fs/tavily tools, offline streaming safety).
  - `modal: python3 -m py_compile agent.py quorum/*.py` → clean.
  - `npm run build` → ✓ Compiled successfully (Next.js 15.5.23), 8 routes registered.
  - `npm run typecheck --workspace=apps/web` → clean, no errors.
  - BYOK invariant re-confirmed: plain LLM key materialized only inside the Inngest `load-llm-key` step, forwarded to Modal as a JSON body field, never an env var or log. Channel name `quorum:run:<runId>` matches between Python `Streamer` and TS `runChannel()`.
- **Next:** Phase 2 remainder — local `modal deploy` smoke test + document the exact deploy/run commands and expected `POST /run` output (blocked in this sandbox by no Modal CLI/credentials). Then Phase 3: Inngest cron for scheduled/always-on bots + multi-bot council UI wiring (acting seats + dissent surfaced in the SSE feed), and wiring Tavily into the Phase-1 `convene.ts` flow.

## 2026-08-23 Build 3 — 3 (persistent bot model + registry + run entrypoint)
- **Phase:** 3 (persistent bot model + registry + run entrypoint)
- **Delivered:** Persistent Bot model + Redis registry + CRUD API + /api/bots/:id/run entrypoint. Added Bot interface w/ ownerId+schedule, BotDraft type, bot Redis helpers (botKey/botIndexKey/getBot/listBotIds/putBot/deleteBot), domain module lib/bots.ts (create/list/get/update/remove + parseBotDraft + resolveSeats), GET/POST /api/bots, GET/PATCH/DELETE /api/bots/[id], POST /api/bots/[id]/run queuing BotRunRequested via Inngest with resolved seats + BYOK key ref.
- **Files:** packages/shared/src/index.ts, apps/web/src/lib/redis.ts, apps/web/src/lib/bots.ts, apps/web/src/app/api/bots/route.ts, apps/web/src/app/api/bots/[id]/route.ts, apps/web/src/app/api/bots/[id]/run/route.ts
- **Verified:** npm run build -> ok (10 static pages, 11 routes incl 3 new /api/bots*); npm run typecheck -> clean; removed dead setBot helper after adversarial review
- **Next:** Wire Inngest BotScheduleFired cron (always-on/scheduled bots) to load bot by id + queue run; surface multi-bot council + dissent in SSE/UI; add persistent run state (list/status) endpoint

## 2026-08-24 Build 4 — Phase 3
- **Phase:** Phase 3
- **Delivered:** Persistent run-state registry (Redis sorted-set index per owner) + list/status API. Runs now transition queued→running→sealed/failed durably; GET /api/runs?userId= and GET /api/runs/[id]?userId= expose list + single status.
- **Files:** apps/web/src/lib/runs.ts, apps/web/src/lib/redis.ts, apps/web/src/app/api/runs/route.ts, apps/web/src/app/api/runs/[id]/route.ts, apps/web/src/inngest/functions.ts, apps/web/src/inngest/client.ts, apps/web/src/app/api/bots/[id]/run/route.ts, packages/shared/src/index.ts
- **Verified:** builder gate verify green (next build compiled 12 routes, tsc --noEmit clean); modal pytest 11/11 passed
- **Next:** Wire run list/status into the UI (history page + live status polling), then Phase-3 Inngest cron for scheduled/always-on bots.

## 2026-08-24 Build 5 — Phase 3
- **Phase:** Phase 3
- **Delivered:** Runs history page + live status polling wired into the UI. Added a 'Runs' nav view rendering the operator's bot-run registry (most-recent first) with status badges (queued/running/awaiting_input/sealed/failed), expandable detail (verdict + dissent, error, steps, positions), and 4s polling against GET /api/runs. Introduced lib/operator.ts for the fixed local operator id pending Phase 4 auth.
- **Files:** apps/web/src/components/runs.tsx, apps/web/src/components/app-shell.tsx, apps/web/src/lib/operator.ts, apps/web/src/lib/types.ts
- **Verified:** builder gate verify GREEN: next build compiled (12 routes, 10 static pages) + tsc --noEmit clean; only pre-existing layout.tsx custom-font warning.
- **Next:** Phase 3 Inngest cron: BotScheduleFired -> load bot by id + queue run for scheduled/always-on bots.

## 2026-08-24 Build 6 — Phase 3: Inngest cron scheduler for scheduled/always-on bots
- **Phase:** Phase 3: Inngest cron scheduler for scheduled/always-on bots
- **Delivered:** tickSchedules Inngest cron (fires every minute) + dispatchSchedule durable fan-out; Bot schedule/task fields plumbed through shared types, bot parser, and redis; reverse owner index + global scheduled-bot set; shared queueBotRun pipeline reused by both on-demand and cron runs; minimal 5-field cron matcher.
- **Files:** apps/web/src/inngest/functions.ts, apps/web/src/lib/cron.ts, apps/web/src/lib/queue.ts, apps/web/src/lib/bots.ts, apps/web/src/lib/redis.ts, apps/web/src/app/api/bots/[id]/run/route.ts, packages/shared/src/index.ts
- **Verified:** npm run build (Next.js 15.5.23 prod build green), npm run typecheck (tsc --noEmit green), npm run lint (only pre-existing font warning), cron matcher unit assertions all passed
- **Next:** Phase 3 remaining: wire schedule/task into the bot create/edit UI form + surface scheduled runs on runs page; then multi-bot council acting-seat loop on Modal agent
