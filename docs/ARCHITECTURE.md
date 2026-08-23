# Quorum v2 — Architecture

A self-hosted, open-source, **$0-to-run** alternative to Grok Bot where bots *act* —
browse, run code, search the web, complete multi-step jobs, work 24/7 — and the
**only secret a user supplies is their LLM API key**. Council + dissent preserved:
seats are *acting workers* (Developer, Researcher, Ops, Adversary), not just opinions.

## Tech stack & responsibilities

| Tech | Responsibility |
| --- | --- |
| **Vercel (Next.js 15)** | UI, GitHub OAuth auth, CRUD API routes, SSE relay for live bot activity |
| **Inngest** | Durable orchestration — triggers Modal agent runs, retries, scheduling/cron for 24/7 routines, passes the user's decrypted LLM key |
| **Modal (Python)** | The bot's "own computer" — full agent loop lives here. Sandbox with Playwright browser, shell, filesystem, tools. Browser profile/cookies persisted to a volume so logins survive across runs |
| **Tavily** | Web search + page extract/crawl — the evidence-gathering tool |
| **Redis (Upstash)** | Bot/session state, job metadata, encrypted LLM-key store (per user), pub/sub for realtime progress streamed from Modal → Vercel |

## Core flow (a bot doing a task)

1. User assigns a task in Vercel UI → `POST /api/bots/:id/run` → `inngest.send()`
2. Inngest durable function fetches the user's encrypted LLM key from Redis, decrypts it,
   and invokes the Modal agent function with the task + key + seat config.
3. Modal runs the **full agent loop** (Python):
   - LLM plans steps (user's key, direct to provider)
   - Tavily search for evidence
   - Playwright browse / shell / fs actions in the sandbox
   - Synthesize result; record dissent if adversarial seat
   - Streams progress to Redis pub/sub after each step
4. Vercel UI subscribes to Redis pub/sub via SSE → live activity feed
5. Result artifacts + sealed verdict + dissent recorded (Quorum DNA preserved)

## LLM key handling (BYOK, $0 operator token cost)

- User enters key in Settings → encrypted with per-deployment `ENCRYPTION_KEY` (Vercel env var)
  → stored in Upstash Redis keyed by user id.
- When a bot runs, Inngest fetches + decrypts the key and passes it to Modal; LLM calls go
  **directly** to the provider (OpenAI / Anthropic / xAI / OpenRouter). Operator pays $0 for tokens.
- Infra (Modal / Tavily / Upstash / Inngest / Vercel) all free-tier-able for a self-hosted instance.

## Build phases

- **Phase 1**: Vercel UI scaffold + Inngest integration + Tavily search tool + BYOK LLM proxy
  + Redis state + SSE live feed. Proves "bot gathers real evidence + reasons + produces artifact."
- **Phase 2**: Modal computer — full Python agent loop with Playwright browse + shell + fs tools,
  persisted browser profile, phased human-in-loop login.
- **Phase 3**: Scheduled/always-on bots via Inngest cron, multi-bot council with acting seats + dissent.
- **Phase 4**: Auth, encryption hardening, deploy docs, open-source polish.

## License

MIT — fork it, host it, change the seats.
