# Quorum v2 — Deployment Guide

This guide walks a self-hoster through deploying Quorum on the free tiers of
Vercel + Inngest + Modal + Upstash Redis + Tavily, with the **BYOK invariant**
front and center: the *only* secret an end user provides is their own LLM API
key, and the operator needs **no** LLM key at all.

> Estimated cost to run: **$0** on the free tiers of all five services (see the
> "Free-tier map" section).

## Architecture recap (who runs where)

| Service | What runs there | Config |
| --- | --- | --- |
| **Vercel** | Next.js 15 UI, API routes, SSE relay, GitHub OAuth | env vars below |
| **Inngest** | Durable orchestration, retries, cron (`run-bot`, `tickSchedules`) | signing key |
| **Modal** | The Python agent loop (`modal/agent.py`) — Playwright + shell + fs + Tavily + LLM | `quorum-agent` secret + `quorum-browser-profiles` volume |
| **Upstash Redis** | Bot/run state, encrypted LLM-key store, pub/sub | `REDIS_URL` |
| **Tavily** | Web search + extract tool | `TAVILY_API_KEY` |

## 1. Create the external resources

1. **Upstash Redis** → create a free Redis database → copy the REST URL (or
   `REDIS_URL`). This holds bot/run state, the encrypted LLM-key store, and the
   pub/sub channel that powers live SSE.
2. **Tavily** → create an API key (free tier).
3. **Inngest** → create an account/app; note the event + signing keys. Quorum
   uses Inngest for the durable `run-bot` function and the `tickSchedules` cron
   (scheduled/always-on bots).
4. **Modal** → create an account and run `modal token new` for a local token
   (used only for deploying `modal/agent.py`, not at runtime).
5. **GitHub OAuth app** (optional — only for multi-user auth) → at
   github.com/settings/developers create an OAuth app with the callback URL
   `https://<your-domain>/api/auth/callback`. Note the client id + secret.

## 2. Deploy the Modal agent (Phase 2)

The full agent loop runs on Modal. Deploy it once:

```bash
cd modal
# One-time: create the infra secret (Tavily + optional Redis so the agent can
# stream progress straight back to Upstash).
modal secret create quorum-agent TAVILY_API_KEY=<tavily> REDIS_URL=<upstash-redis-url>

modal deploy agent.py
```

`modal deploy` prints an HTTPS URL like
`https://<org>--quorum-agent-run.modal.run`. Copy it — it becomes `MODAL_AGENT_URL`.

The browser profile (cookies/logins) persists on the auto-created
`quorum-browser-profiles` Modal volume, so a bot's logins survive across runs.

## 3. Deploy the Vercel app

From the repo root:

```bash
npm install
vercel        # preview; or `vercel --prod` for production
```

Then set the environment variables (Vercel dashboard → Settings → Environment
Variables, or `vercel env add`). The full set is documented in `.env.example`:

### Infra (operator-only — set in Vercel, never commit)

| Variable | Purpose |
| --- | --- |
| `REDIS_URL` (or `UPSTASH_REDIS_REST_URL`) | State + encrypted key store + pub/sub |
| `ENCRYPTION_KEY` | AES-256-GCM key that encrypts user LLM keys at rest (see "Encryption" below) |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | Inngest delivery + signing |
| `TAVILY_API_KEY` | Web search/extract |
| `MODAL_AGENT_URL` | HTTPS URL of the deployed Modal endpoint |

### Auth (optional — leave unset for single-operator local mode)

| Variable | Purpose |
| --- | --- |
| `SESSION_SECRET` | HMAC-SHA256 signing key for session + OAuth-state cookies |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | GitHub OAuth app credentials |
| `GITHUB_REDIRECT_URI` | Optional; defaults to `<origin>/api/auth/callback` |

When `GITHUB_CLIENT_ID` + `GITHUB_CLIENT_SECRET` are both set, owner-namespaced
routes require a signed session cookie and derive the user id from GitHub. When
they are unset, Quorum runs as a single local operator (no sign-in) — suitable
for a private, single-user instance.

## 4. Wire Inngest

Inngest needs to reach the app's `POST /api/inngest` endpoint. In the Inngest
dashboard, add the Vercel deployment as an app origin (or point it at the
served URL). Inngest signs requests with `INNGEST_SIGNING_KEY`, so keep that in
sync with the dashboard value.

## Encryption & key rotation

Quorum encrypts every user LLM key with **AES-256-GCM** before it is written to
Redis. The key material is derived from the `ENCRYPTION_KEY` env var:

- If `ENCRYPTION_KEY` is **≥ 32 bytes**, its first 32 bytes are used directly as
  the AES-256 key.
- If it is **shorter**, its UTF-8 bytes are hashed with SHA-256 to derive a
  full-length 256-bit key.

Each encrypted payload stores a fresh random 12-byte IV alongside the
ciphertext, so the same plaintext never produces the same ciphertext.

### Rotating `ENCRYPTION_KEY`

The key encrypts *user* LLM keys, so rotation has a concrete, bounded blast
radius. There is no silent re-encryption: **changing `ENCRYPTION_KEY` invalidates
every stored LLM key** (decryption fails with a GCM authentication error, which
the app surfaces as "No LLM key stored for this user").

To rotate safely:

1. **Set a new `ENCRYPTION_KEY`** in Vercel. (Optionally: before rotating, note
   which users have a stored key — there is no bulk re-encryption path today.)
2. **Ask users to re-enter their key** in Settings. Each user's key is
   re-encrypted with the new key on their next save.
3. **Redeploy** so the new env var takes effect for the Inngest steps that
   decrypt keys.

> Do **not** rotate `SESSION_SECRET` casually in a multi-user deploy — it would
> invalidate all active sessions (users simply re-sign-in, no data loss). The
> session cookie is *signed*, not encrypted, so it contains no secret material
> to protect by rotation; rotate it only if you believe it was compromised.

### Generating strong values

```bash
# ENCRYPTION_KEY (64 hex chars = 32 bytes)
openssl rand -hex 32

# SESSION_SECRET (64 hex chars = 32 bytes)
openssl rand -hex 32
```

## 5. Verify the deployment

1. **Inngest** → trigger `run-bot` manually (or POST `/api/runs`) and confirm
   the run transitions `queued → running → sealed/failed` and streams events.
2. **Modal** → `modal logs quorum-agent` shows the agent loop executing.
3. **SSE** → open the Runs view; the activity feed should update in near-realtime
   as the Modal agent publishes to Redis pub/sub.
4. **BYOK check** → store a key in Settings, confirm it lands in Redis as an
   encrypted payload (never plaintext), and that `GET /api/llm-key` reports
   `stored` without ever returning the key itself.

## Free-tier map

| Service | Free tier | Notes |
| --- | --- | --- |
| Vercel | Hobby | Enough for a self-hosted UI + API + SSE |
| Inngest | Free tier | Covers the durable function + cron volume |
| Modal | $30/mo free credits | Agent runs are short-lived, well within free quota |
| Upstash Redis | Free tier | State + key store + pub/sub fit comfortably |
| Tavily | Free tier (1,000 credits/mo) | Search/extract tool |

LLM token spend is **on the user's own key** (BYOK) — the operator pays $0.
