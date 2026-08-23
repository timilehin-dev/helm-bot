"""Quorum v2 Modal agent package (Phase 2).

The full Python agent loop: plan → acting seats run tools (shell, fs, Tavily
search, browser) → chair seals a verdict + records dissent. Progress streams to
Redis pub/sub for the Vercel SSE feed. See ``modal/agent.py`` for the Modal
entrypoint (Playwright + persistent profile volume).
"""

from .agent import AgentLoop
from .llm import make_chat, parse_json_block
from .seats import SEATS, resolve_seats
from .stream import Streamer
from .tools import Browser, FsTool, ShellTool, TavilyTool
from .types import (
    LlmConfig,
    Position,
    RunRequest,
    RunResult,
    Seat,
    ToolOutcome,
)

__all__ = [
    "AgentLoop",
    "Browser",
    "FsTool",
    "LlmConfig",
    "Position",
    "RunRequest",
    "RunResult",
    "SEATS",
    "Seat",
    "ShellTool",
    "Streamer",
    "TavilyTool",
    "ToolOutcome",
    "make_chat",
    "parse_json_block",
    "resolve_seats",
]
