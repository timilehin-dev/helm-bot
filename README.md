# Quorum

**A self-hosted alternative to Grok Bot — built as a council, not a chat clone.**

Grok Bot (SpaceXAI / xAI, Aug 2026) is a team of always-on AI teammates on **vendor cloud computers**. You message them like colleagues; they sign into your tools and finish multi-step jobs. Powerful — and locked to their stack, their memory, their pricing.

Quorum takes a different product bet:

| Grok Bot | Quorum |
| --- | --- |
| Chat threads with bots | **Chamber sessions** — one question, parallel seats |
| Vendor-hosted VM per bot | **You host the app**; no bot VMs required for the core loop |
| Opaque memory | **Inspectable, editable ledger** |
| Single-vendor model | **BYOK cloud models** (OpenAI, Anthropic, xAI, OpenRouter, custom) |
| Consensus-friendly teammates | **Adversary seat** + sealed **dissent** |

## The novelty

1. **Unit of work is a session, not a message.** You convene. Specialists answer **at the same time**. A chair **seals a verdict** and records minority reports.
2. **Dissent is first-class.** Kade (Adversary) is not optional in the default sitting — if the room agrees too fast, the product is failing.
3. **Cloud brains, local custody.** No Ollama required. Point at any OpenAI-compatible API (or Anthropic). Your key is **encrypted at rest in your own Redis** (AES-256-GCM, per-deployment `ENCRYPTION_KEY`) and only ever decrypted in-flight to run your bot — the operator never needs an LLM key.

## Quick start

```bash
npm install
npm run dev
```

Open http://localhost:3000. Go to **Settings**, paste a cloud API key, return to the **Chamber**, and convene.

### Providers

| Provider | Base URL | Example model |
| --- | --- | --- |
| OpenAI | `https://api.openai.com/v1` | `gpt-4o` |
| Anthropic | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
| xAI | `https://api.x.ai/v1` | `grok-4.5` |
| OpenRouter | `https://openrouter.ai/api/v1` | `openai/gpt-4o` |
| Custom | your gateway | any chat model |

## Deploy

Self-hosting is the point: the only secret an end user provides is their own
LLM API key. See **[`docs/DEPLOY.md`](docs/DEPLOY.md)** for the full
Vercel + Inngest + Modal + Upstash + Tavily walkthrough (all free-tier-able),
the env-var reference, and encryption-key rotation notes.

## Architecture

- **Next.js 15** App Router + Tailwind v4 — UI, GitHub OAuth auth, CRUD API routes, SSE relay
- **Inngest** — durable orchestration: triggers agent runs, retries, and a cron scheduler for 24/7 routines
- **Modal (Python)** — the full agent loop: Playwright browse + shell + fs + Tavily + LLM, with the browser profile persisted to a volume
- **Tavily** — web search + page extract for evidence gathering
- **Redis (Upstash)** — bot/run state, the encrypted LLM-key store, and pub/sub for live progress
- **BYOK everywhere** — `ENCRYPTION_KEY` encrypts your LLM key at rest; it's decrypted only inside an Inngest step and passed to Modal, never persisted or logged

A chamber convenes specialists in parallel, then the chair seals a verdict and
records dissent. Scheduled and always-on bots run via Inngest cron; live
activity streams back over SSE. See
**[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md)** for the full design.

## Standing seats

Five **acting** seats — workers with concrete toolsets, not just opinions:

- **Ivo** — Chair: plans the job, delegates, seals a verdict, records dissent
- **Reed** — Developer: writes and runs code in the sandbox, produces artifacts
- **Vale** — Researcher: gathers and cites web evidence (search + extract)
- **Sage** — Ops: filesystem work, environment checks, execution logistics
- **Kade** — Adversary: attacks the majority reading; if the room agrees too fast, the product is failing

## Why not just clone Grok Bot?

Because the competitive surface is not "another messaging app with agents." Grok Bot already owns that shape on a managed computer. A self-hosted product that is still a transcript loses on distribution. A chamber that produces **sealed artifacts + recorded dissent** wins on sovereignty and judgment quality.

## Contributing & security

- **[`CONTRIBUTING.md`](CONTRIBUTING.md)** — monorepo layout, setup, and the checks that gate a change.
- **[`SECURITY.md`](SECURITY.md)** — the BYOK/session security model and how to report a vulnerability.
- **[`docs/BUILDER_LOOP.md`](docs/BUILDER_LOOP.md)** — how the automated builder operates (graph + verify-fix loop).

## License

MIT — fork it, host it, change the seats.
