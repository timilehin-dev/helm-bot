# Contributing to Quorum

Thanks for wanting to help. Quorum is a self-hosted, open-source alternative to
Grok Bot — a council of **acting** seats (Developer, Researcher, Ops, Adversary)
that browse, run code, search the web, and finish multi-step jobs 24/7, where
the **only secret a user supplies is their LLM API key**.

## Monorepo layout

| Path | What it is |
| --- | --- |
| `apps/web` | Next.js 15 App Router UI + auth + API routes + SSE relay |
| `packages/shared` | Dependency-free shared domain types (seats, bots, runs, events) |
| `modal/` | The Python agent loop (Playwright + shell + fs + Tavily + LLM) |
| `docs/` | Architecture, deploy, and the builder-loop spec |

## One-time setup

```bash
npm install          # installs all workspaces
npm run dev          # starts the Next.js app on http://localhost:3000
```

For the Python agent loop:

```bash
cd modal
pip install -e .
pytest -q            # runs the agent-loop tests
```

No LLM key is needed to develop — the operator never needs one. To exercise
the full loop, point the app at a Modal deploy (see `docs/DEPLOY.md`) or run
the Python agent directly with a key.

## The checks that matter

Before opening a PR, make these pass:

```bash
npm run build       # Next.js production build (must compile clean)
npm run typecheck   # tsc --noEmit across the workspace
npm test            # tsx --test unit tests (lib/*.test.ts)
npm run lint        # eslint (one legacy font warning is known/acceptable)
```

And for the Modal agent:

```bash
cd modal && pytest -q && python3 -m py_compile agent.py quorum/*.py
```

## How changes land

- Work is committed directly to `main` by the automated builder (no PRs for
  the automation); external contributors are welcome to open PRs against
  `main`.
- **One logical change per commit**, with a message that says *what* and *why*.
- The build is "done" only when the verification gate passes on the real
  commands above — never on a self-assessment. Don't weaken tests, typechecks,
  or lint to pass; if a check is genuinely wrong, say so explicitly in the
  commit message instead of silently deleting it.
- The automation follows `docs/BUILDER_LOOP.md` — a fixed
  `READ → PLAN → IMPLEMENT → VERIFY → REVIEW → COMMIT → RECORD` graph with a
  bounded verify-fix loop. Keep that file's guarantees in mind when you change
  build-critical paths.

## Conventions

- **BYOK is sacred.** Never hardcode an LLM key, log a decrypted key, or commit
  a real `.env`. Only `ENCRYPTION_KEY`-encrypted payloads may be persisted.
- **Monorepo boundaries:** shared types go in `packages/shared` (no runtime
  deps); app code stays in `apps/web`; the agent loop stays in `modal/`.
- Prefer small, dependency-free changes. Add a test when you change logic in
  `apps/web/src/lib/*` or `modal/quorum/*`.
- TypeScript: `tsc --noEmit` clean. Python: stdlib-first, no new third-party
  deps without a clear reason in the commit message.

## Where to look first

- `docs/ARCHITECTURE.md` — the full system design and data flow.
- `docs/DEPLOY.md` — the env-var reference and deploy walkthrough.
- `docs/BUILDER_LOOP.md` — how the automated builder operates.
- `SECURITY.md` — the BYOK/session security model and how to report issues.

## License

MIT. By contributing you agree your work is licensed the same way. Fork it,
host it, change the seats.
