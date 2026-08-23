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

**Phase 0 — scaffolding.** Repo is the legacy Quorum v1 (deliberation-only, Next.js, no tools).
A full rewrite is in progress. No v2 code has been committed yet.

## Build history

<!-- Append new entries below. Format:
## YYYY-MM-DD Build N — <short title>
- **Phase:** <which phase>
- **Delivered:** <measurable, working deliverables>
- **Files:** <key files added/changed>
- **Verified:** <how it was tested / what runs>
- **Next:** <what the next build should tackle>
-->
