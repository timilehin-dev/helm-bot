"""Modal entrypoint for the Quorum v2 agent.

Deploy with::

    modal deploy modal/agent.py

Modal runs the **full agent loop** here: plan → acting seats run tools (shell,
filesystem, Tavily search, Playwright browse) → chair seals a verdict + records
dissent. Progress streams to Redis pub/sub (Upstash) for the Vercel SSE feed.

BYOK: the user's LLM API key arrives as a field on the JSON body of ``POST /run``
— it is never read from the environment and never persisted. Infra secrets
(Tavily / Redis) come from a ``quorum-agent`` Modal Secret and the operator's
env vars at deploy time.

The browser profile lives on the ``quorum-browser-profiles`` volume so logins
survive across runs.
"""

from __future__ import annotations

from typing import Any, Optional

import modal

# --- image -----------------------------------------------------------------
# Playwright's Chromium needs system libraries; `install-deps` fetches them.
image = (
    modal.Image.debian_slim(python_version="3.11")
    .pip_install("playwright", "redis", "requests")
    .run_commands(
        "playwright install-deps chromium",
        "playwright install chromium",
    )
)

app = modal.App("quorum-agent", image=image)

# Browser profiles persist here so cookies/logins survive between runs.
PROFILE_VOLUME = modal.Volume.from_name("quorum-browser-profiles", create_if_missing=True)
PROFILE_DIR = "/browser-data"

# Infra secrets (TAVILY_API_KEY, optional REDIS_URL) — operator-only, never user keys.
agent_secret = modal.Secret.from_name("quorum-agent")


class PlaywrightBrowser:
    """Playwright-backed ``Browser`` adapter using a persistent profile."""

    def __init__(self, profile_dir: str):
        self.profile_dir = profile_dir

    def goto(self, url: str) -> str:
        # Imported lazily so the module imports even before the image is built.
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            ctx = p.chromium.launch_persistent_context(
                user_data_dir=f"{self.profile_dir}/profile",
                headless=True,
            )
            try:
                page = ctx.new_page()
                page.goto(url, wait_until="domcontentloaded", timeout=30_000)
                text = page.inner_text("body")
                return text[:4000]
            finally:
                ctx.close()


@app.function(
    volumes={PROFILE_DIR: PROFILE_VOLUME},
    secrets=[agent_secret],
    timeout=60 * 15,
    allow_concurrent_inputs=4,
)
@modal.web_endpoint(method="POST", label="quorum-agent-run")
def run(payload: dict[str, Any]) -> dict[str, Any]:
    """Handle ``POST /run`` from the Inngest durable function.

    Body mirrors ``ModalRunRequest`` in ``apps/web/src/lib/modal.ts``.
    """
    from quorum import AgentLoop, RunRequest, Streamer, make_chat

    req = RunRequest.from_dict(payload)

    streamer = Streamer.from_url(req.runId, _redis_url())

    def chat(system: str, user: str) -> str:
        return make_chat(req.llm, req.apiKey)(system, user)

    browser = PlaywrightBrowser(PROFILE_DIR)
    loop = AgentLoop(chat=chat, req=req, streamer=streamer, browser=browser)
    result = loop.run()
    return result.to_dict()


def _redis_url() -> Optional[str]:
    import os

    return os.environ.get("REDIS_URL") or os.environ.get("UPSTASH_REDIS_REST_URL")
