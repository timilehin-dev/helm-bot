"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { OPERATOR_ID } from "@/lib/operator";
import type { AgentStep, BotRun, RunPosition, RunStatus } from "@quorum/shared";

const POLL_MS = 4000;

const STATUS_META: Record<RunStatus, { label: string; className: string }> = {
  queued: { label: "Queued", className: "bg-raised text-muted ring-1 ring-border" },
  running: { label: "Running", className: "bg-accent/15 text-accent ring-1 ring-border-strong" },
  awaiting_input: { label: "Awaiting input", className: "bg-warn/15 text-warn ring-1 ring-border" },
  sealed: { label: "Sealed", className: "bg-ok/15 text-ok ring-1 ring-border" },
  failed: { label: "Failed", className: "bg-danger/15 text-danger ring-1 ring-border" },
};

const STEP_ICON: Record<AgentStep["kind"], string> = {
  plan: "◈",
  search: "⌕",
  browse: "◫",
  shell: "❯",
  fs: "▤",
  llm: "✦",
  synthesize: "⇥",
  dissent: "⚠",
};

function formatWhen(ts?: number) {
  if (!ts) return "—";
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hrs = Math.round(min / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(ts).toLocaleString();
}

function Badge({ status }: { status: RunStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.queued;
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${meta.className}`}
    >
      {meta.label}
    </span>
  );
}

function StepList({ steps }: { steps: AgentStep[] }) {
  if (steps.length === 0) return <p className="text-xs text-muted">No steps yet.</p>;
  return (
    <ul className="mt-2 space-y-1">
      {steps.map((s) => (
        <li key={s.id} className="flex items-start gap-2 text-xs">
          <span className="mt-px font-mono text-subtle">{STEP_ICON[s.kind] ?? "·"}</span>
          <span className="min-w-0 flex-1">
            <span className="text-fg">{s.title}</span>
            {s.detail && <span className="ml-1 text-muted">— {s.detail}</span>}
          </span>
          <span className="shrink-0 font-mono text-[10px] text-subtle">{s.status}</span>
        </li>
      ))}
    </ul>
  );
}

function Positions({ positions }: { positions: RunPosition[] }) {
  if (positions.length === 0) return null;
  return (
    <ul className="mt-3 space-y-2">
      {positions.map((p) => (
        <li key={p.seatId} className="rounded-lg border border-border bg-raised/40 p-3">
          <div className="flex items-center justify-between gap-2">
            <p className="font-mono text-xs text-muted">{p.seatId}</p>
            {p.dissent && (
              <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] font-medium text-warn">
                Dissent
              </span>
            )}
          </div>
          {p.stance && <p className="mt-1 text-sm font-medium">{p.stance}</p>}
          {p.body && (
            <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-muted">{p.body}</p>
          )}
        </li>
      ))}
    </ul>
  );
}

function RunDetail({ run }: { run: BotRun }) {
  return (
    <div className="mt-4 space-y-4">
      {(run.verdict || run.status === "sealed") && (
        <div className="rounded-lg border border-border bg-surface p-4">
          <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Verdict</p>
          <p className="mt-1 text-sm text-fg">{run.verdict || "Sealed with no verdict text."}</p>
          {run.dissent && run.dissent !== "None recorded." && (
            <div className="mt-3 border-t border-border pt-3">
              <p className="font-mono text-[11px] tracking-[0.14em] text-warn uppercase">Dissent</p>
              <p className="mt-1 text-xs text-muted">{run.dissent}</p>
            </div>
          )}
        </div>
      )}
      {run.error && (
        <div className="rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {run.error}
        </div>
      )}
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Steps</p>
        <StepList steps={run.steps} />
      </div>
      <div className="rounded-lg border border-border bg-surface p-4">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">Positions</p>
        <Positions positions={run.positions} />
      </div>
    </div>
  );
}

/**
 * Run history + live status.
 *
 * Lists the operator's runs (most-recent first) and polls the registry every
 * few seconds so queued/running runs reflect their latest durable state without
 * requiring an SSE subscription. Selecting a run expands its full detail
 * (verdict, dissent, steps, positions).
 */
export function Runs() {
  const [runs, setRuns] = useState<BotRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/runs?userId=${encodeURIComponent(OPERATOR_ID)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Failed to load runs (${res.status})`);
      const data = (await res.json()) as { ok: boolean; runs: BotRun[] };
      if (mounted.current) {
        setRuns(data.runs ?? []);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Failed to load runs");
      }
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      mounted.current = false;
      clearInterval(timer);
    };
  }, [load]);

  const active = runs?.find((r) => r.id === selected) ?? null;

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-border lg:w-80 lg:border-r lg:border-b-0">
        <div className="px-4 py-4">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">Runs</p>
          <h1 className="font-display mt-1 text-xl tracking-tight">Bot history</h1>
          <p className="mt-1 text-xs text-muted">
            Live status · refreshes automatically
          </p>
        </div>
        <ul className="px-2 pb-4">
          {runs === null && !error && (
            <li className="px-3 py-2 text-sm text-muted">Loading…</li>
          )}
          {error && <li className="px-3 py-2 text-sm text-danger">{error}</li>}
          {runs !== null && runs.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No runs yet.</li>
          )}
          {runs?.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => setSelected(r.id === selected ? null : r.id)}
                className={`flex w-full flex-col gap-1 rounded-md px-3 py-2.5 text-left ${
                  active?.id === r.id
                    ? "bg-raised text-fg"
                    : "text-muted hover:bg-raised/50 hover:text-fg"
                }`}
              >
                <span className="line-clamp-1 text-sm text-fg">{r.task}</span>
                <span className="flex items-center gap-2">
                  <Badge status={r.status} />
                  <span className="font-mono text-[10px] text-subtle">
                    {formatWhen(r.createdAt)}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      </aside>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {active ? (
          <div>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-display text-lg leading-snug tracking-tight">{active.task}</h2>
                <p className="mt-1 font-mono text-[11px] text-subtle">
                  {active.id} · {active.botId}
                </p>
              </div>
              <Badge status={active.status} />
            </div>
            <div className="mt-2 flex flex-wrap gap-4 font-mono text-[11px] text-muted">
              <span>Created {formatWhen(active.createdAt)}</span>
              {active.sealedAt && <span>Sealed {formatWhen(active.sealedAt)}</span>}
              <span>{active.seatIds.length} seats</span>
            </div>
            <RunDetail run={active} />
          </div>
        ) : (
          <p className="text-sm text-muted">
            {loading ? "Refreshing…" : "Select a run to view its detail."}
          </p>
        )}
      </div>
    </div>
  );
}
