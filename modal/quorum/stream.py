"""Progress streaming for the agent.

The Modal agent publishes ``RunEvent`` payloads to Redis pub/sub (Upstash) so
the Vercel SSE route can relay them to the browser in real time. A no-op
``Streamer`` is used when no Redis URL is provided, keeping the loop testable
and runnable offline.
"""

from __future__ import annotations

import json
from typing import Any, Optional, Protocol


class Publisher(Protocol):
    def publish(self, channel: str, message: str) -> None: ...


def _redis_client(url: str) -> Publisher:
    # Import lazily so `redis` is only required when a URL is configured.
    import redis  # type: ignore

    return redis.Redis.from_url(url)  # type: ignore[return-value]


class Streamer:
    """Publishes run events to ``quorum:run:<runId>``.

    The channel name must match ``runChannel()`` in ``apps/web/src/lib/redis.ts``.
    """

    def __init__(self, run_id: str, publisher: Optional[Publisher] = None):
        self.run_id = run_id
        self._pub = publisher

    @classmethod
    def from_url(cls, run_id: str, redis_url: Optional[str]) -> "Streamer":
        publisher = _redis_client(redis_url) if redis_url else None
        return cls(run_id, publisher)

    @property
    def channel(self) -> str:
        return f"quorum:run:{self.run_id}"

    def emit(self, event: dict[str, Any]) -> None:
        if self._pub is None:
            return
        try:
            self._pub.publish(self.channel, json.dumps(event))
        except Exception:
            # Streaming must never crash the agent loop.
            pass

    def step_started(self, seat_id: str, step: dict[str, Any]) -> None:
        self.emit({"type": "step:started", "runId": self.run_id, "step": step})

    def step_done(self, seat_id: str, step: dict[str, Any]) -> None:
        self.emit({"type": "step:done", "runId": self.run_id, "step": step})

    def position(self, position: dict[str, Any]) -> None:
        self.emit({"type": "position", "runId": self.run_id, "position": position})

    def sealed(self, verdict: str, dissent: str) -> None:
        self.emit(
            {
                "type": "run:sealed",
                "runId": self.run_id,
                "verdict": verdict,
                "dissent": dissent,
                "at": 0,
            }
        )

    def failed(self, error: str) -> None:
        self.emit({"type": "run:failed", "runId": self.run_id, "error": error, "at": 0})


class RecordingPublisher:
    """In-memory publisher for tests; records channel → messages."""

    def __init__(self) -> None:
        self.messages: list[tuple[str, str]] = []

    def publish(self, channel: str, message: str) -> None:
        self.messages.append((channel, message))

    def events(self) -> list[dict[str, Any]]:
        return [json.loads(m) for _, m in self.messages]
