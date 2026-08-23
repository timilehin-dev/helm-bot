"""Core domain types for the Quorum Modal agent.

These mirror the TypeScript types in ``packages/shared/src/index.ts`` and are
serialized as JSON over the wire. They deliberately carry no Modal/Redis/Tavily
dependency so the package stays unit-testable.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal, Optional

SeatRole = Literal["chair", "developer", "researcher", "ops", "adversary"]


@dataclass
class Seat:
    id: str
    name: str
    role: SeatRole
    mandate: str
    initials: str
    chair: bool = False

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "Seat":
        return cls(
            id=str(d.get("id", "")),
            name=str(d.get("name", "")),
            role=d.get("role", "ops"),  # type: ignore[arg-type]
            mandate=str(d.get("mandate", "")),
            initials=str(d.get("initials", "")),
            chair=bool(d.get("chair", False)),
        )


@dataclass
class LlmConfig:
    provider: str
    baseUrl: str
    model: str

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "LlmConfig":
        return cls(
            provider=str(d.get("provider", "openai")),
            baseUrl=str(d.get("baseUrl", "")),
            model=str(d.get("model", "")),
        )


@dataclass
class RunRequest:
    runId: str
    task: str
    seats: list[Seat]
    chairId: str
    apiKey: str
    llm: LlmConfig
    infra: dict[str, str] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> "RunRequest":
        seats = [Seat.from_dict(s) for s in (d.get("seats") or [])]
        return cls(
            runId=str(d.get("runId", "")),
            task=str(d.get("task", "")),
            seats=seats,
            chairId=str(d.get("chairId", "")),
            apiKey=str(d.get("apiKey", "")),
            llm=LlmConfig.from_dict(d.get("llm") or {}),
            infra={str(k): str(v) for k, v in (d.get("infra") or {}).items()},
        )


@dataclass
class Position:
    seatId: str
    stance: str
    body: str
    dissent: bool = False

    def to_dict(self) -> dict[str, Any]:
        return {
            "seatId": self.seatId,
            "stance": self.stance,
            "body": self.body,
            "dissent": self.dissent,
        }


@dataclass
class RunResult:
    ok: bool
    runId: str = ""
    verdict: str = ""
    dissent: str = ""
    positions: list[Position] = field(default_factory=list)
    error: str = ""

    def to_dict(self) -> dict[str, Any]:
        return {
            "ok": self.ok,
            "runId": self.runId,
            "verdict": self.verdict,
            "dissent": self.dissent,
            "error": self.error,
        }


StepKind = Literal[
    "plan", "search", "browse", "shell", "fs", "llm", "synthesize", "dissent"
]


@dataclass
class ToolOutcome:
    """Structured output of a single tool action, surfaced to the LLM and UI."""

    tool: StepKind
    title: str
    detail: str = ""
    artifact: Optional[dict[str, str]] = None

    def to_step(self, seat_id: str, status: str = "done") -> dict[str, Any]:
        step: dict[str, Any] = {
            "id": f"step_{self.tool}_{abs(hash(self.title)) % 10_000_000:07d}",
            "seatId": seat_id,
            "kind": self.tool,
            "title": self.title,
            "detail": self.detail,
            "status": status,
            "at": 0,
        }
        if self.artifact:
            step["artifact"] = self.artifact
        return step
