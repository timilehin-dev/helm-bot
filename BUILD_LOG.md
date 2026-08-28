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

## 2026-08-25 Build 7 — Phase 3 — bots UI (registry + schedule/task wiring)
- **Phase:** Phase 3 — bots UI (registry + schedule/task wiring)
- **Delivered:** Bots management view (create/edit/delete/run) wired into app nav; schedule (5-field cron) + standing task fields in the create/edit form with client validation; client-safe seat resolution via canonical shared SEATS; parseBotDraft now always carries schedule/task so PATCH can clear them (cron re-index via putBot verified).
- **Files:** apps/web/src/components/bots.tsx (new), apps/web/src/lib/seats.ts (new), apps/web/src/components/app-shell.tsx, apps/web/src/lib/types.ts, apps/web/src/lib/bots.ts
- **Verified:** builder_gate verify GREEN: next build compiled (10 static routes) + tsc --noEmit exit 0; only pre-existing layout.tsx font warning remains.
- **Next:** Wire scheduled runs into the Runs view (show botId/schedule provenance + next-fire estimate), then Phase 4 auth to replace the fixed 'local' operator id.

## 2026-08-25 Build 8 — Phase 3 — Runs view schedule + next-fire provenance
- **Phase:** Phase 3 — Runs view schedule + next-fire provenance
- **Delivered:** Added nextFire() to lib/cron.ts (bounded minute-scan next-fire estimator for 5-field cron). Runs view now loads bots alongside runs and surfaces per-run bot name + schedule provenance, plus a 'Next scheduled' footer listing each scheduled bot's next-fire estimate.
- **Files:** apps/web/src/lib/cron.ts, apps/web/src/components/runs.tsx
- **Verified:** builder_gate verify GREEN (npm run build compiled 12 routes/10 static pages, tsc --noEmit clean; only pre-existing layout.tsx font warning). Real cron.ts nextFire/cronMatches exercised via node --experimental-strip-types: */1, */15, specific-minute, malformed, and out-of-range cases all passed.
- **Next:** Phase 4: replace the fixed 'local' operator id with real auth (GitHub OAuth / session), then encryption hardening + deploy docs.

## 2026-08-25 Build 9 — Phase 4 — Auth
- **Phase:** Phase 4 — Auth
- **Delivered:** GitHub OAuth + signed-session identity wired into owner-namespaced routes (bots, bots/[id], bots/[id]/run, runs, runs/[id], runs/[id]/stream, llm-key, auth/me/login/logout/callback). lib/auth.ts centralizes session signing (node:crypto HMAC), OAuth state verification, resolveUserId() with LOCAL_OPERATOR_ID fallback. lib/operator.ts now a dependency-free fallback constant. .env.example documents SESSION_SECRET/GITHUB_* vars. Auth is gated by AUTH_REQUIRED env so local single-operator mode is preserved.
- **Files:** apps/web/src/lib/auth.ts, apps/web/src/lib/operator.ts, apps/web/src/app/api/{bots,bots/[id],bots/[id]/run,runs,runs/[id],runs/[id]/stream,llm-key,auth/*}/route.ts, .env.example
- **Verified:** python3 /tmp/builder_gate.py verify -> ok:true (npm run build + typecheck both exit 0). Fixed STATE_COOKIE import + stream ownership check. Builder gate risky-path check fixed (false positive on .env.example).
- **Next:** Wire auth UI (sign-in/out button) and add tests for auth.ts session round-trip + resolveUserId precedence; then Phase 4 hardening docs.

## 2026-08-26 Build 10 — Phase 4 — Auth UI (session userId wiring)
- **Phase:** Phase 4 — Auth UI (session userId wiring)
- **Delivered:** Client auth context (AuthProvider + useAuth) reading /api/auth/me; SignInGate blocking the app when GitHub auth is required; AuthButton (Sign in / user label / Sign out); Bots & Runs components now namespace all fetches and mutations under the signed-in userId instead of the fixed local operator id.
- **Files:** apps/web/src/lib/auth-context.tsx, apps/web/src/components/auth.tsx, apps/web/src/components/app-shell.tsx, apps/web/src/components/bots.tsx, apps/web/src/components/runs.tsx
- **Verified:** npm run build (green, 14/14 static pages, auth/me + login + logout + callback routes built) and npm run typecheck (green) via builder gate verify
- **Next:** Thread session-scoped userId through the remaining server mutations (runs run action, chat), then Phase 4 deploy docs + encryption hardening.

## 2026-08-26 Build 11 — Phase 4 — Auth (BYOK store) threading
- **Phase:** Phase 4 — Auth (BYOK store) threading
- **Delivered:** Session-scoped POST /api/chat: resolves owner via resolveUserId (no longer trusts an anonymous body), prefers the server-side encrypted BYOK key + non-secret provider metadata (getDecryptedKey/getProviderMeta), renders 'No LLM key stored for this user' instead of leaking a client key, and falls back to the legacy Phase-1 body key/config only for single-operator local mode before a key is persisted. Completes threading of session userId into the final remaining server mutation (runs POST was already scoped).
- **Files:** apps/web/src/app/api/chat/route.ts
- **Verified:** builder gate verify GREEN: npm run build exit 0 (Next 15.5.23, 14 static pages, /api/chat + all routes compile) + npm run typecheck (tsc --noEmit) exit 0; only pre-existing layout.tsx custom-font warning. Installed deps first (next/tsc missing). Post-review diff clean: no secrets/node_modules/risky paths.
- **Next:** Migrate the Settings UI (client convene.ts/chat caller) to persist the LLM key via POST /api/llm-key and stop sending the raw Phase-1 localStorage apiKey body, then Phase 4 deploy docs + encryption hardening notes.

## 2026-08-27 Build 12 — Phase 4 — Auth/BYOK Settings persistence
- **Phase:** Phase 4 — Auth/BYOK Settings persistence
- **Delivered:** Settings UI now persists the BYOK LLM key server-side via POST /api/llm-key (encrypted in Redis) and stops sending the raw Phase-1 localStorage apiKey body once a key is stored. Added GET /api/llm-key status endpoint (configured/stored/meta), client llm-status.ts helpers (getLlmStatus/saveLlmKey), store keyConfigured/keyStoreReady/setKeyStatus/refreshKeyStatus, redis.redisConfigured(), and convene.ts userId threading so the chat route resolves the server-side key.
- **Files:** apps/web/src/app/api/llm-key/route.ts, apps/web/src/lib/llm-status.ts, apps/web/src/lib/store.tsx, apps/web/src/lib/redis.ts, apps/web/src/lib/convene.ts, apps/web/src/components/chamber.tsx, apps/web/src/components/settings.tsx
- **Verified:** builder_gate verify GREEN: npm run build exit 0 (Next 15.5.23, 16 routes incl /api/llm-key GET+POST) + npm run typecheck (tsc --noEmit) exit 0; only pre-existing layout.tsx custom-font warning. Post-review diff clean: no secrets/node_modules/risky paths.
- **Next:** Phase 4 hardening: add tests for auth.ts session round-trip + resolveOwner precedence, document ENCRYPTION_KEY/SESSION_SECRET/GITHUB_* deploy setup in docs/ARCHITECTURE.md or a DEPLOY guide, and note encryption key rotation considerations.

## 2026-08-27 Build 13 — Phase 4 — Auth tests
- **Phase:** Phase 4 — Auth tests
- **Delivered:** Unit tests for lib/auth.ts (14 tests, 3 suites): session token round-trip, tamper rejection, wrong-secret rejection, expiry rejection, missing-field rejection, OAuth state nonce round-trip, and resolveOwner precedence (session > required refusal > hint > local operator). Wired into npm test via tsx.
- **Files:** apps/web/src/lib/auth.test.ts, package.json, apps/web/package.json
- **Verified:** builder_gate verify GREEN: npm run build exit 0 (Next 15.5.23, 16 routes) + npm run typecheck (tsc --noEmit) exit 0 + npm test (tsx --test) 14/14 pass. Tests exercise real auth.ts code paths (node:crypto HMAC), no mocks.
- **Next:** Phase 4 hardening: document ENCRYPTION_KEY/SESSION_SECRET/GITHUB_* deploy setup (DEPLOY guide / ARCHITECTURE.md) and encryption key rotation considerations.

## 2026-08-27 Build 14 — Phase 4 — deploy docs + encryption rotation
- **Phase:** Phase 4 — deploy docs + encryption rotation
- **Delivered:** docs/DEPLOY.md full self-host deploy guide (Vercel + Inngest + Modal + Upstash + Tavily on free tiers) covering all env vars (REDIS_URL/ENCRYPTION_KEY/INNGEST_*/TAVILY_API_KEY/MODAL_AGENT_URL/GITHUB_*), AES-256-GCM key-derivation details, ENCRYPTION_KEY rotation (invalidates stored user keys -> re-enter) vs SESSION_SECRET (sign-not-encrypt) guidance, verification checklist, and a free-tier map. Cross-linked from docs/ARCHITECTURE.md (Deployment & secrets section) and README.md (Deploy section).
- **Files:** docs/DEPLOY.md (new), docs/ARCHITECTURE.md, README.md
- **Verified:** builder_gate verify GREEN: npm run build exit 0 (Next 15.5.23, 16 routes/14 static pages) + npm run typecheck (tsc --noEmit) exit 0 + npm test (tsx --test) 14/14 pass. Only pre-existing layout.tsx custom-font warning. AES-GCM derivation facts cross-checked against apps/web/src/lib/llm-key-store.ts. Post-review diff clean: docs-only, no secrets/node_modules/risky paths.
- **Next:** Phase 4 open-source polish: README contributor/architecture polish + CONTRIBUTING/SECURITY docs, or an end-to-end smoke checklist; then revisit Modal deploy command fidelity + wire Tavily into convene.ts if still pending.

## 2026-08-28 Build 15 — Phase 4 — open-source polish (CONTRIBUTING + SECURITY + README refresh)
- **Phase:** Phase 4 — open-source polish (CONTRIBUTING + SECURITY + README refresh)
- **Delivered:** Added CONTRIBUTING.md (monorepo layout, one-time setup, the checks that gate a change, conventions, where to look first) and SECURITY.md (BYOK AES-256-GCM model, sign-don't-encrypt sessions, least-privilege isolation, reporting process, self-host checklist). Refreshed README: corrected stale v1 'Standing seats' to the 5 canonical acting seats (added Sage/Ops, corrected Reed=Developer and Vale=Researcher), replaced stale 'keys stay in your browser' with the BYOK encrypted-at-rest model, and rewrote the Architecture section to the full Phase-4 stack (Next.js/Inngest/Modal/Tavily/Redis). Added a Contributing & security links section.
- **Files:** CONTRIBUTING.md, SECURITY.md, README.md
- **Verified:** builder_gate verify GREEN: npm run build exit 0 (Next 15.5.23, 16 routes/14 static pages) + npm run typecheck (tsc --noEmit) exit 0 + npm test 14/14 pass; only pre-existing layout.tsx custom-font warning. Adversarial review caught one inaccuracy (referenced a nonexistent AUTH_REQUIRED env var; corrected to the real GITHUB_CLIENT_ID+GITHUB_CLIENT_SECRET trigger confirmed in lib/auth.ts). Diff clean: docs-only, no secrets/node_modules/risky paths.
- **Next:** Phase 4 remaining polish: add a docs/SMOKE.md end-to-end verification checklist (or an automated smoke script), then revisit Modal deploy command fidelity + wire Tavily search into the Phase-1 convene.ts council flow so a bot gathers real evidence before Modal lands.
