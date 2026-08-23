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
3. **Cloud brains, local custody.** No Ollama required. Point at any OpenAI-compatible API (or Anthropic). Keys stay in your browser; calls go through your self-hosted server route.

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

## Architecture

- **Next.js 15** App Router + Tailwind v4
- **React context** + localStorage for seats, sessions, ledger, dock
- **`POST /api/chat`** — server proxy so API keys are used server-side; still **your** key, **your** bill
- Parallel specialist calls via `Promise.all`, then one chair seal

## Standing seats

- **Ivo** — Chair: seals verdicts, refuses fake consensus
- **Reed** — Evidence: facts and briefs
- **Vale** — Voice: plain drafts into the dock
- **Kade** — Adversary: attacks the majority reading

## Why not just clone Grok Bot?

Because the competitive surface is not "another messaging app with agents." Grok Bot already owns that shape on a managed computer. A self-hosted product that is still a transcript loses on distribution. A chamber that produces **sealed artifacts + recorded dissent** wins on sovereignty and judgment quality.

## License

MIT — fork it, host it, change the seats.
