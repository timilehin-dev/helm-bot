"""BYOK LLM client.

Calls the user's own provider directly (OpenAI-compatible chat completions, or
Anthropic Messages API). The API key is passed in explicitly — it is never read
from the environment and never logged. Zero third-party HTTP deps so the module
works anywhere Python runs (including inside Modal and in unit tests).
"""

from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any, Optional, Protocol

from .types import LlmConfig

# Providers using the Anthropic Messages shape (not OpenAI-compatible chat).
ANTHROPIC_PROVIDERS = {"anthropic"}


class ChatFn(Protocol):
    """Callable shape so the agent loop can be tested with a fake LLM."""

    def __call__(self, system: str, user: str) -> str: ...


def _openai_compatible(config: LlmConfig, api_key: str, system: str, user: str) -> str:
    url = config.baseUrl.rstrip("/")
    # Accept a base URL that already points at /chat/completions or a v1 root.
    if not url.endswith("/chat/completions"):
        url = f"{url}/chat/completions"
    payload: dict[str, Any] = {
        "model": config.model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.2,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "replace")
        raise RuntimeError(f"LLM HTTP {err.code}: {body[:300]}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"LLM request failed: {err.reason}") from err

    try:
        return str(data["choices"][0]["message"]["content"]).strip()
    except (KeyError, IndexError, TypeError) as err:
        raise RuntimeError(f"Unexpected LLM response shape: {str(data)[:300]}") from err


def _anthropic(config: LlmConfig, api_key: str, system: str, user: str) -> str:
    url = config.baseUrl.rstrip("/")
    if not url.endswith("/messages"):
        url = f"{url}/messages"
    payload = {
        "model": config.model,
        "max_tokens": 2048,
        "system": system,
        "messages": [{"role": "user", "content": user}],
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            data = json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as err:
        body = err.read().decode("utf-8", "replace")
        raise RuntimeError(f"LLM HTTP {err.code}: {body[:300]}") from err
    except urllib.error.URLError as err:
        raise RuntimeError(f"LLM request failed: {err.reason}") from err

    try:
        return str(data["content"][0]["text"]).strip()
    except (KeyError, IndexError, TypeError) as err:
        raise RuntimeError(f"Unexpected Anthropic response shape: {str(data)[:300]}") from err


def make_chat(config: LlmConfig, api_key: str) -> ChatFn:
    """Return a ``ChatFn`` that calls the configured provider with the key."""
    if config.provider in ANTHROPIC_PROVIDERS:
        return lambda system, user: _anthropic(config, api_key, system, user)
    return lambda system, user: _openai_compatible(config, api_key, system, user)


def parse_json_block(raw: str) -> Optional[dict[str, Any]]:
    """Extract a JSON object from a model reply (fenced or bare)."""
    fenced = raw
    for marker in ("```json", "```"):
        if marker in fenced:
            fenced = fenced.split(marker, 1)[1].split("```", 1)[0]
            break
    start = fenced.find("{")
    end = fenced.rfind("}")
    if start < 0 or end <= start:
        return None
    try:
        return json.loads(fenced[start : end + 1])
    except json.JSONDecodeError:
        return None
