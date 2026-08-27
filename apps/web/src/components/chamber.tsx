"use client";

import { useState } from "react";
import { EXAMPLE_PROMPTS } from "@/lib/seed";
import { IVO, uid, useQuorum } from "@/lib/store";
import { convene } from "@/lib/convene";
import { useAuth } from "@/lib/auth-context";
import type { Session } from "@/lib/types";

function formatWhen(ts: number) {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function Chamber() {
  const {
    seats,
    sittingIds,
    toggleSitting,
    sessions,
    activeSessionId,
    setActiveSession,
    addSession,
    patchSession,
    memories,
    provider,
    keyConfigured,
    convening,
    setConvening,
    setSeatStatus,
    upsertFile,
    setView,
  } = useQuorum();
  const { userId } = useAuth();

  const [question, setQuestion] = useState("");
  const [error, setError] = useState<string | null>(null);

  const active = sessions.find((s) => s.id === activeSessionId) ?? sessions[0];
  const specialists = seats.filter((s) => !s.chair);
  // A server-side key (keyConfigured) or the legacy localStorage key makes the
  // chamber usable. The presence of a userId alone does not — in local mode
  // userId is always "local", so relying on it would never gate on a key.
  const keyReady = keyConfigured || Boolean(provider.apiKey.trim());

  async function onConvene(e?: React.FormEvent) {
    e?.preventDefault();
    const q = question.trim();
    if (!q || convening) return;
    if (!keyReady) {
      setError("Add a cloud API key in Settings first.");
      setView("settings");
      return;
    }

    setError(null);
    setConvening(true);
    const id = uid("session");
    const draft: Session = {
      id,
      question: q,
      seatIds: [...sittingIds],
      chairId: IVO,
      status: "convening",
      positions: [],
      verdict: "",
      dissent: "",
      createdAt: Date.now(),
    };
    addSession(draft);
    sittingIds.forEach((sid) => setSeatStatus(sid, "deliberating"));
    setSeatStatus(IVO, "deliberating");

    const result = await convene({
      question: q,
      seats: seats.map((s) => ({
        id: s.id,
        name: s.name,
        role: s.role,
        mandate: s.mandate,
        chair: s.chair,
      })),
      chairId: IVO,
      seatIds: sittingIds,
      memories: memories.map((m) => m.text),
      // When a key is stored server-side, never put the plain localStorage key
      // on the wire — the chat route resolves it from Redis instead. The body
      // apiKey remains only for the legacy local-mode fallback (no server key).
      provider: keyConfigured ? { ...provider, apiKey: "" } : provider,
      userId: userId ?? undefined,
    });

    seats.forEach((s) => setSeatStatus(s.id, "idle"));
    setConvening(false);

    if (!result.ok) {
      patchSession(id, { status: "failed", error: result.error });
      setError(result.error);
      return;
    }

    patchSession(id, {
      status: "sealed",
      positions: result.positions,
      verdict: result.verdict,
      dissent: result.dissent,
      sealedAt: Date.now(),
    });
    if (result.verdictFile) {
      upsertFile(result.verdictFile.path, result.verdictFile.content);
    }
    setQuestion("");
  }

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-4 py-8 sm:px-8">
      <header>
        <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
          Chamber
        </p>
        <h1 className="font-display mt-1 text-3xl tracking-tight sm:text-4xl">
          Pose a question. Seats answer at once.
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-muted">
          Specialists deliberate in parallel. The chair seals a verdict and
          records dissent. Cloud models think — the ledger stays here.
        </p>
      </header>

      <form
        onSubmit={onConvene}
        className="rounded-xl border border-border bg-surface p-4 sm:p-5"
      >
        <label className="text-xs font-medium text-muted">Convene</label>
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          placeholder="What should the chamber decide?"
          rows={3}
          disabled={convening}
          className="mt-2 w-full resize-none border-0 bg-transparent text-sm text-fg outline-none placeholder:text-subtle"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {specialists.map((s) => {
            const on = sittingIds.includes(s.id);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => toggleSitting(s.id)}
                disabled={convening}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  on
                    ? "bg-raised text-fg ring-1 ring-border-strong"
                    : "text-muted hover:bg-raised/60 hover:text-fg"
                }`}
              >
                {s.name} · {s.role}
              </button>
            );
          })}
        </div>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-subtle">
            {keyReady
              ? `${provider.provider} · ${provider.model}`
              : "No API key — open Settings"}
          </p>
          <button
            type="submit"
            disabled={convening || !question.trim()}
            className="h-10 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-40"
          >
            {convening ? "Deliberating…" : "Convene"}
          </button>
        </div>
        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </form>

      {!question && (
        <div className="flex flex-wrap gap-2">
          {EXAMPLE_PROMPTS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setQuestion(p)}
              className="rounded-md border border-border bg-raised/40 px-3 py-2 text-left text-xs text-muted hover:text-fg"
            >
              {p}
            </button>
          ))}
        </div>
      )}

      {active && (
        <section className="space-y-5">
          <div className="flex items-end justify-between gap-4">
            <div>
              <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
                {active.status === "convening"
                  ? "In session"
                  : active.status === "failed"
                    ? "Failed"
                    : "Sealed"}
              </p>
              <h2 className="font-display mt-1 text-xl tracking-tight">
                {active.question}
              </h2>
            </div>
            <span className="shrink-0 font-mono text-xs text-subtle tabular-nums">
              {formatWhen(active.createdAt)}
            </span>
          </div>

          {active.status === "convening" && (
            <div className="grid gap-3 sm:grid-cols-3">
              {active.seatIds.map((id) => {
                const s = seats.find((x) => x.id === id);
                return (
                  <div
                    key={id}
                    className="rounded-lg border border-border bg-raised/50 p-4"
                  >
                    <p className="text-sm font-medium quorum-pulse">
                      {s?.name ?? id}
                    </p>
                    <p className="mt-1 text-xs text-muted">Deliberating…</p>
                  </div>
                );
              })}
            </div>
          )}

          {active.status === "failed" && (
            <p className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
              {active.error}
            </p>
          )}

          {active.status === "sealed" && (
            <>
              <div className="rounded-xl border border-border bg-surface p-5">
                <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
                  Verdict
                </p>
                <p className="font-display mt-2 text-lg leading-snug tracking-tight">
                  {active.verdict}
                </p>
                {active.dissent && active.dissent !== "None recorded." && (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="font-mono text-[11px] tracking-[0.14em] text-warn uppercase">
                      Dissent
                    </p>
                    <p className="mt-1 text-sm text-muted">{active.dissent}</p>
                  </div>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {active.positions.map((p) => {
                  const s = seats.find((x) => x.id === p.seatId);
                  return (
                    <article
                      key={p.seatId}
                      className="flex flex-col rounded-lg border border-border bg-raised/40 p-4"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="text-sm font-medium">
                          {s?.name ?? p.seatId}
                          <span className="ml-2 text-xs font-normal text-muted">
                            {s?.role}
                          </span>
                        </p>
                        {p.dissent && (
                          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-medium text-warn">
                            Dissent
                          </span>
                        )}
                      </div>
                      <p className="font-display mt-2 text-sm italic leading-snug text-fg/90">
                        {p.stance}
                      </p>
                      <p className="mt-2 flex-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">
                        {p.body}
                      </p>
                    </article>
                  );
                })}
              </div>
            </>
          )}
        </section>
      )}

      {sessions.length > 1 && (
        <section>
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
            Prior sessions
          </p>
          <ul className="mt-3 space-y-1">
            {sessions.slice(0, 8).map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setActiveSession(s.id)}
                  className={`w-full rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                    s.id === activeSessionId
                      ? "bg-raised text-fg"
                      : "text-muted hover:bg-raised/50 hover:text-fg"
                  }`}
                >
                  <span className="line-clamp-1">{s.question}</span>
                  <span className="mt-0.5 block font-mono text-[10px] text-subtle">
                    {s.status} · {formatWhen(s.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
