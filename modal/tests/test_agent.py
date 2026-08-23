"""Tests for the Quorum Modal agent loop (no network, no credentials)."""

import json
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

from quorum import (  # noqa: E402
    AgentLoop,
    RunRequest,
    SEATS,
    Streamer,
    make_chat,
    parse_json_block,
)
from quorum.stream import RecordingPublisher
from quorum.types import LlmConfig, RunResult, Seat


def make_request(**overrides) -> RunRequest:
    base = {
        "runId": "run_test",
        "task": "Investigate whether the library has a published release.",
        "seats": SEATS,
        "chairId": "seat_chair",
        "apiKey": "test-key",
        "llm": LlmConfig(provider="openai", baseUrl="https://api.openai.com/v1", model="gpt-4o-mini"),
    }
    base.update(overrides)
    return RunRequest(**base)


class FakeChat:
    """Deterministic chat that returns seat-specific JSON."""

    def __init__(self):
        self.calls: list[tuple[str, str]] = []

    def __call__(self, system: str, user: str) -> str:
        self.calls.append((system, user))
        if "Chair" in system and "Seal" in system:
            return '{"verdict": "Release exists; adopt it.", "dissent": "Kade: lock-in risk."}'
        if "Chair" in system:
            return '{"plan": "1) search 2) verify 3) seal"}'
        if "adversary" in system:
            return '{"stance": "There is lock-in risk.", "body": "A hidden cost.", "dissent": true}'
        return '{"stance": "Proceed.", "body": "Evidence supports it.", "dissent": false}'


def test_parse_json_block_fenced():
    raw = 'Here you go:\n```json\n{"a": 1}\n```'
    assert parse_json_block(raw) == {"a": 1}


def test_parse_json_block_bare():
    assert parse_json_block('{"x": "y"}') == {"x": "y"}


def test_parse_json_block_none():
    assert parse_json_block("no json here") is None


def test_make_chat_is_callable():
    chat = make_chat(LlmConfig("openai", "https://api.openai.com/v1", "gpt-4o-mini"), "k")
    assert callable(chat)


def test_agent_loop_end_to_end():
    chat = FakeChat()
    pub = RecordingPublisher()
    req = make_request()
    loop = AgentLoop(chat=chat, req=req, streamer=Streamer(req.runId, pub))
    result = loop.run()

    assert isinstance(result, RunResult)
    assert result.ok is True
    assert result.runId == "run_test"
    assert "Release exists" in result.verdict
    assert "lock-in" in result.dissent

    # Every seat filed a position.
    specialist_ids = {s.id for s in SEATS if not s.chair}
    assert {p.seatId for p in result.positions} == specialist_ids

    # The adversary dissented.
    adv = next(p for p in result.positions if p.seatId == "seat_adversary")
    assert adv.dissent is True

    # The loop sealed and streamed real events.
    events = pub.events()
    assert any(e["type"] == "run:sealed" for e in events)
    assert any(e["type"] == "step:done" for e in events)
    assert any(e["type"] == "position" for e in events)


def test_agent_loop_no_streaming_is_safe():
    loop = AgentLoop(chat=FakeChat(), req=make_request(), streamer=Streamer("run_x", None))
    result = loop.run()
    assert result.ok is True


def test_agent_loop_handles_llm_exception():
    def boom(system, user):
        raise RuntimeError("llm down")

    loop = AgentLoop(chat=boom, req=make_request(), streamer=Streamer("run_x", None))
    result = loop.run()
    assert result.ok is False
    assert "llm down" in result.error


def test_shell_tool_runs_and_truncates(tmp_path):
    from quorum.tools import ShellTool

    out = ShellTool(cwd=str(tmp_path)).run("echo hello")
    assert out.tool == "shell"
    assert "hello" in out.detail


def test_fs_tool_write_read_list(tmp_path):
    from quorum.tools import FsTool

    fs = FsTool(root=str(tmp_path))
    fs.write("a/b.txt", "hello")
    assert "hello" in fs.read("a/b.txt").detail
    assert "a" in fs.list(".").detail


def test_tavily_unconfigured_degrades():
    from quorum.tools import TavilyTool

    out = TavilyTool(api_key=None).search("anything")
    assert out.tool == "search"
    assert "not configured" in out.detail.lower()


def test_seats_canonical():
    roles = {s.role for s in SEATS}
    assert roles == {"chair", "developer", "researcher", "ops", "adversary"}
    assert any(s.chair for s in SEATS)
