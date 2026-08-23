"""The acting tools: shell, filesystem, and Tavily search/extract.

These are the "hands" of each acting seat. They are dependency-light and
injectable so the agent loop can run in Modal (with real Playwright + shell) or
in tests (with fakes). No tool hardcodes credentials; secrets arrive via the
``RunRequest.infra`` dict or the constructor.
"""

from __future__ import annotations

import json
import os
import subprocess
import urllib.error
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional, Protocol

from .types import ToolOutcome


class Browser(Protocol):
    """Minimal browsing surface. The real Playwright adapter implements this."""

    def goto(self, url: str) -> str:
        """Navigate to a URL and return visible text/markdown of the page."""


@dataclass
class ShellTool:
    """Run shell commands in a bounded, configurable working directory."""

    cwd: str = "/work"
    timeout: int = 60

    def run(self, command: str) -> ToolOutcome:
        try:
            proc = subprocess.run(
                command,
                shell=True,
                cwd=self.cwd,
                capture_output=True,
                text=True,
                timeout=self.timeout,
            )
        except subprocess.TimeoutExpired as err:
            return ToolOutcome(
                tool="shell",
                title=command[:120],
                detail=f"Timed out after {self.timeout}s",
            )
        except Exception as err:  # pragma: no cover - defensive
            return ToolOutcome(tool="shell", title=command[:120], detail=f"Error: {err}")

        output = (proc.stdout or "") + (proc.stderr or "")
        detail = output.strip() or "(no output)"
        return ToolOutcome(
            tool="shell",
            title=command[:120],
            detail=detail[:2000],
        )


@dataclass
class FsTool:
    """Read/write/list files inside the sandbox workdir."""

    root: str = "/work"

    def _resolve(self, path: str) -> Path:
        p = Path(path)
        if not p.is_absolute():
            p = Path(self.root) / p
        return p

    def read(self, path: str) -> ToolOutcome:
        try:
            content = self._resolve(path).read_text(encoding="utf-8", errors="replace")
        except Exception as err:
            return ToolOutcome(tool="fs", title=f"read {path}", detail=f"Error: {err}")
        return ToolOutcome(
            tool="fs",
            title=f"read {path}",
            detail=content[:2000],
            artifact={"kind": "file", "content": content},
        )

    def write(self, path: str, content: str) -> ToolOutcome:
        p = self._resolve(path)
        try:
            p.parent.mkdir(parents=True, exist_ok=True)
            p.write_text(content, encoding="utf-8")
        except Exception as err:
            return ToolOutcome(tool="fs", title=f"write {path}", detail=f"Error: {err}")
        return ToolOutcome(tool="fs", title=f"write {path}", detail=f"Wrote {len(content)} chars")

    def list(self, path: str = ".") -> ToolOutcome:
        p = self._resolve(path)
        try:
            entries = sorted(str(x.relative_to(p)) for x in p.iterdir())
        except Exception as err:
            return ToolOutcome(tool="fs", title=f"ls {path}", detail=f"Error: {err}")
        return ToolOutcome(tool="fs", title=f"ls {path}", detail="\n".join(entries) or "(empty)")


@dataclass
class TavilyTool:
    """Web search + extract using the operator's Tavily API key."""

    api_key: Optional[str] = None
    endpoint: str = "https://api.tavily.com"

    def search(self, query: str, max_results: int = 5) -> ToolOutcome:
        if not self.api_key:
            return ToolOutcome(
                tool="search",
                title=query[:120],
                detail="Tavily not configured (no TAVILY_API_KEY).",
            )
        return self._post(
            "/search",
            {"api_key": self.api_key, "query": query, "max_results": max_results},
            title=f"search: {query[:120]}",
        )

    def extract(self, urls: list[str]) -> ToolOutcome:
        if not self.api_key:
            return ToolOutcome(
                tool="search",
                title="extract",
                detail="Tavily not configured (no TAVILY_API_KEY).",
            )
        return self._post(
            "/extract",
            {"api_key": self.api_key, "urls": urls},
            title=f"extract: {len(urls)} url(s)",
        )

    def _post(self, path: str, payload: dict[str, Any], title: str) -> ToolOutcome:
        req = urllib.request.Request(
            f"{self.endpoint}{path}",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                data = json.loads(resp.read().decode("utf-8"))
        except urllib.error.HTTPError as err:
            body = err.read().decode("utf-8", "replace")
            return ToolOutcome(tool="search", title=title, detail=f"Tavily {err.code}: {body[:300]}")
        except urllib.error.URLError as err:
            return ToolOutcome(tool="search", title=title, detail=f"Tavily error: {err.reason}")

        # Normalize into a compact, LLM-friendly text block.
        if "results" in data and isinstance(data["results"], list):
            lines = []
            for r in data["results"]:
                if isinstance(r, dict):
                    lines.append(f"- {r.get('title', '')} ({r.get('url', '')})")
                    content = r.get("content") or r.get("raw_content")
                    if content:
                        lines.append(f"  {str(content)[:300]}")
            detail = "\n".join(lines)[:2000] or "(no results)"
        else:
            detail = str(data)[:2000]
        return ToolOutcome(tool="search", title=title, detail=detail)
