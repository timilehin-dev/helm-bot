"""The Quorum agent loop.

The "computer" that a bot gets: it plans with the LLM, lets each acting seat run
its tools (shell, fs, search, browse), then has the chair synthesize a verdict
and records dissent. This module is Modal-free and dependency-light so it runs
anywhere — the Modal entrypoint (``modal/agent.py``) just wires up real
Playwright + a persistent volume + Redis streaming.

LLM calls go through a ``ChatFn`` (see ``llm.make_chat``); tests inject a fake
so the whole loop is exercised without any network or credentials.
"""

from __future__ import annotations

import json
from typing import Any, Optional

from .llm import ChatFn, parse_json_block
from .seats import resolve_seats
from .stream import Streamer
from .tools import Browser, FsTool, ShellTool, TavilyTool
from .types import Position, RunRequest, RunResult, Seat, ToolOutcome

# Safety cap on acting seats per run (chair excluded). Covers all 4 specialists
# (developer, researcher, ops, adversary) so dissent is never truncated away.
MAX_SPECIALISTS = 4


def _fmt_outcome(seat_id: str, o: ToolOutcome) -> str:
    return f"[{o.tool}] {o.title}\n{o.detail}"


class AgentLoop:
    def __init__(
        self,
        chat: ChatFn,
        req: RunRequest,
        streamer: Streamer,
        browser: Optional[Browser] = None,
        shell: Optional[ShellTool] = None,
        fs: Optional[FsTool] = None,
        tavily: Optional[TavilyTool] = None,
    ):
        self.chat = chat
        self.req = req
        self.streamer = streamer
        self.browser = browser
        self.shell = shell or ShellTool()
        self.fs = fs or FsTool()
        self.tavily = tavily or TavilyTool(api_key=req.infra.get("tavilyApiKey"))
        self.seats = resolve_seats(req.seats)
        self.chair = next((s for s in self.seats if s.id == req.chairId), None) or next(
            (s for s in self.seats if s.chair), self.seats[0]
        )

    def run(self) -> RunResult:
        try:
            return self._run()
        except Exception as err:  # noqa: BLE001 - the loop must always seal or fail
            self.streamer.failed(str(err))
            return RunResult(ok=False, runId=self.req.runId, error=str(err))

    def _run(self) -> RunResult:
        plan = self._plan()

        positions: list[Position] = []
        for seat in self._specialists():
            positions.append(self._act(seat, plan))

        verdict, dissent = self._synthesize(plan, positions)
        self.streamer.sealed(verdict, dissent)

        return RunResult(
            ok=True,
            runId=self.req.runId,
            verdict=verdict,
            dissent=dissent,
            positions=positions,
        )

    # --- steps -----------------------------------------------------------

    def _plan(self) -> str:
        seat = self.chair
        system = f"You are {seat.name}, Chair of Quorum.\nMandate: {seat.mandate}"
        user = (
            f"Task:\n{self.req.task}\n\n"
            f"Acting seats: {', '.join(s.name + ' (' + s.role + ')' for s in self.seats)}\n\n"
            "Produce a short, concrete plan. List the steps each seat should take, "
            "and return ONLY valid JSON with one key: plan (string)."
        )
        raw = self.chat(system, user)
        parsed = parse_json_block(raw)
        plan = str(parsed.get("plan", raw)) if parsed else raw

        self.streamer.emit(
            {
                "type": "step:done",
                "runId": self.req.runId,
                "step": {
                    "id": "step_plan",
                    "seatId": seat.id,
                    "kind": "plan",
                    "title": "Plan",
                    "detail": plan[:2000],
                    "status": "done",
                    "at": 0,
                },
            }
        )
        return plan

    def _specialists(self) -> list[Seat]:
        return [s for s in self.seats if not s.chair][:MAX_SPECIALISTS]

    def _act(self, seat: Seat, plan: str) -> Position:
        system = (
            f"You are {seat.name}, the {seat.role} seat in Quorum.\n"
            f"Mandate: {seat.mandate}\n\n"
            "Run the tools appropriate to your role to gather evidence, then file "
            "your position. Return ONLY valid JSON with keys: stance (one sentence), "
            "body (2-5 short paragraphs or bullets), dissent (boolean)."
        )
        user = f"Task:\n{self.req.task}\n\nPlan:\n{plan}"

        # Concrete work: each seat actually uses its tools before forming a view.
        evidence = self._gather(seat)

        if evidence:
            user += "\n\nEvidence you gathered:\n" + "\n\n".join(evidence)

        raw = self.chat(system, user)
        parsed = parse_json_block(raw)
        if parsed:
            pos = Position(
                seatId=seat.id,
                stance=str(parsed.get("stance", "")).strip() or "Position filed.",
                body=str(parsed.get("body", raw)).strip(),
                dissent=bool(parsed.get("dissent", False)),
            )
        else:
            pos = Position(seatId=seat.id, stance="Position filed.", body=raw.strip(), dissent=False)
        self.streamer.position(pos.to_dict())
        return pos

    def _gather(self, seat: Seat) -> list[str]:
        """Have a seat run its role-appropriate tools and return evidence text."""
        evidence: list[str] = []
        outcomes: list[ToolOutcome] = []

        if seat.role in ("researcher", "chair"):
            outcomes.append(self.tavily.search(self.req.task))

        if seat.role == "developer":
            # Demonstrate the sandbox: inspect then write + run a tiny script.
            outcomes.append(self.shell.run("pwd && ls -la"))
            outcomes.append(self.fs.write("/work/note.txt", f"Task: {self.req.task}\n"))
            outcomes.append(self.shell.run("cat /work/note.txt"))

        if seat.role == "ops":
            outcomes.append(self.shell.run("python3 --version 2>/dev/null || true"))
            outcomes.append(self.fs.list("/work"))

        if seat.role == "adversary":
            # The adversary re-checks assumptions rather than trusting the prompt.
            outcomes.append(self.tavily.search(f"risks OR downsides of {self.req.task}"))

        if seat.role in ("researcher", "adversary") and self.browser is not None:
            try:
                outcomes.append(ToolOutcome(tool="browse", title="browse", detail=self.browser.goto("https://example.com")[:1000]))
            except Exception as err:
                outcomes.append(ToolOutcome(tool="browse", title="browse", detail=f"browse error: {err}"))

        for o in outcomes:
            self.streamer.emit(
                {
                    "type": "step:done",
                    "runId": self.req.runId,
                    "step": o.to_step(seat.id),
                }
            )
            evidence.append(_fmt_outcome(seat.id, o))

        return evidence

    def _synthesize(self, plan: str, positions: list[Position]) -> tuple[str, str]:
        chair = self.chair
        lines = []
        for p in positions:
            s = next((x for x in self.seats if x.id == p.seatId), None)
            tag = f"{s.name} ({s.role})" if s else p.seatId
            if p.dissent:
                tag += " · DISSENT"
            lines.append(f"### {tag}\nStance: {p.stance}\n{p.body}")

        system = (
            f"You are {chair.name}, Chair of Quorum.\nMandate: {chair.mandate}\n\n"
            "Seal a clear decision. Record dissent honestly; never erase minority "
            "reports. Return ONLY valid JSON with keys: verdict (string) and "
            "dissent (string; use 'None recorded.' if none)."
        )
        user = f"Task:\n{self.req.task}\n\nPositions:\n" + "\n\n".join(lines)

        raw = self.chat(system, user)
        parsed = parse_json_block(raw)
        if parsed:
            verdict = str(parsed.get("verdict", "")).strip() or raw.strip()
            dissent = str(parsed.get("dissent", "None recorded.")).strip()
        else:
            verdict = raw.strip()
            dissent = "None recorded."

        self.streamer.emit(
            {
                "type": "step:done",
                "runId": self.req.runId,
                "step": {
                    "id": "step_synthesize",
                    "seatId": chair.id,
                    "kind": "synthesize",
                    "title": "Seal verdict",
                    "detail": verdict[:2000],
                    "status": "done",
                    "at": 0,
                },
            }
        )
        return verdict, dissent
