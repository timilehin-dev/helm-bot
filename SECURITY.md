# Security Policy

Quorum's core bet is **sovereignty**: you self-host it, you own the data, and the
**only secret you ever hand over is your own LLM API key**. This document spells
out the security model, how to report a vulnerability, and what self-hosters
should protect.

## Security model

### BYOK — the LLM key is the only user secret

- A user's LLM API key is encrypted **before it ever touches Redis** with
  AES-256-GCM using a per-deployment `ENCRYPTION_KEY` (a Vercel/operator env
  var, never hardcoded). See `apps/web/src/lib/llm-key-store.ts`.
- The plaintext key is materialized **only inside an Inngest step**, forwarded
  to the Modal agent over HTTPS as a request body field, and never logged,
  cached, or persisted in the clear. The operator never needs an LLM key.
- **Rotating `ENCRYPTION_KEY` invalidates every stored user key** (GCM auth
  fails on decrypt) — users must re-enter their key. There is no bulk
  re-encryption path. See `docs/DEPLOY.md`.

### Sessions — sign, don't encrypt

- GitHub OAuth sessions use an HMAC-SHA256 **signed** cookie
  (`quorum_session`), plus a signed OAuth `state` nonce cookie to prevent CSRF
  on the callback. There is no server-side session store to leak. See
  `apps/web/src/lib/auth.ts`.
- `SESSION_SECRET` signs (never encrypts) and contains no secret material.
  Rotate it only on compromise — rotating it invalidates active sessions but
  does **not** affect stored LLM keys.

### Least privilege & isolation

- The Modal agent is the only component that runs untrusted LLM-directed
  actions (browser, shell, filesystem), and it runs in Modal's isolated
  sandbox — not on the operator's machine or the Vercel function.
- Infra secrets (`REDIS_URL`, `INNGEST_*`, `TAVILY_API_KEY`, `MODAL_AGENT_URL`,
  `GITHUB_*`) are read from the environment and are **never** hardcoded or
  committed. `.env*` is gitignored (except the documented `.env.example`).

## Reporting a vulnerability

Quorum is a small open-source project with no paid security team. If you find a
vulnerability — especially anything that could leak a user's LLM key, forge a
session, or escape the Modal sandbox — please:

1. **Do not** open a public issue with a working exploit for a key-leak or
   session-forgery class bug.
2. Open a GitHub issue titled `[security] …` with a clear description, impact,
   and (if you have one) a minimal reproduction. For sensitive details you'd
   rather not post publicly, describe the impact and say you'd like a private
   channel, and a maintainer will follow up.

We'll acknowledge within a few days and treat key-exposure and
session-forgery reports as top priority.

## Self-hosting checklist

A self-hosted Quorum instance is only as safe as its operator's secrets
hygiene:

- Generate a long, random `ENCRYPTION_KEY` (32+ bytes recommended) and
  `SESSION_SECRET`, and store them only in your platform's secrets manager.
- Set `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` + `SESSION_SECRET` for
  multi-user mode (auth becomes required whenever GitHub OAuth is fully
  configured); leave them unset only for a private, single-user deploy.
- Use the free-tier vendor defaults and never commit a populated `.env` file.
- Keep the GitHub OAuth callback URL registered exactly as configured
  (see `docs/DEPLOY.md`).

## Supported versions

Only the latest commit on `main` is supported. Quorum is pre-1.0; upgrade
promptly and pin your own fork if you need a frozen version.
