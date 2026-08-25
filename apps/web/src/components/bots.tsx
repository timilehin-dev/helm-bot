"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SEATS, type Bot, type Seat } from "@quorum/shared";
import { OPERATOR_ID } from "@/lib/operator";
import { resolveSeats } from "@/lib/seats";

/**
 * Bots registry — create, edit, delete, and run persistent bots.
 *
 * Backed by the `/api/bots*` + `/api/bots/:id/run` routes. The create/edit form
 * exposes the Phase-3 `schedule` (5-field cron) and standing `task` fields so a
 * bot can be configured to run on its own through the Inngest cron ticker.
 */

const CHAIR = SEATS.find((s) => s.chair) ?? SEATS[0];

function validateCron(expr: string): string | null {
  const t = expr.trim();
  if (!t) return null;
  const parts = t.split(/\s+/);
  if (parts.length !== 5) return "Schedule must be 5 fields: minute hour day-of-month month day-of-week";
  const bounds: Array<[number, number]> = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 6],
  ];
  for (let i = 0; i < 5; i++) {
    const field = parts[i];
    if (field === "*") continue;
    const valid = field
      .split(",")
      .every((sub) => {
        const [base] = sub.split("/");
        if (base === "*") return true;
        const [lo, hi] = base.split("-");
        const a = Number(lo);
        const b = hi === undefined ? a : Number(hi);
        if (Number.isNaN(a) || Number.isNaN(b) || a > b) return false;
        const [min, max] = bounds[i];
        return a >= min && b <= max;
      });
    if (!valid) return `Invalid schedule field "${field}"`;
  }
  return null;
}

function shortId(id: string) {
  return id.length > 18 ? `${id.slice(0, 8)}…${id.slice(-4)}` : id;
}

interface BotFormProps {
  initial?: Bot;
  onCancel: () => void;
  onSaved: (bot: Bot) => void;
  onError: (msg: string) => void;
}

function BotForm({ initial, onCancel, onSaved, onError }: BotFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [seatIds, setSeatIds] = useState<string[]>(
    initial?.seatIds ?? [SEATS[0].id, SEATS[1].id, SEATS[3].id],
  );
  const chairId = initial?.chairId || CHAIR.id;
  const [schedule, setSchedule] = useState(initial?.schedule ?? "");
  const [task, setTask] = useState(initial?.task ?? "");
  const [saving, setSaving] = useState(false);

  function toggleSeat(id: string) {
    setSeatIds((cur) =>
      cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id],
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || saving) return;

    const cronErr = validateCron(schedule);
    if (cronErr) {
      onError(cronErr);
      return;
    }
    if (schedule.trim() && !task.trim()) {
      onError("A scheduled bot needs a standing task (what it runs each time).");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        userId: OPERATOR_ID,
        name: name.trim(),
        seatIds,
        chairId,
        schedule: schedule.trim(),
        task: task.trim(),
      };
      const res = await fetch(initial ? `/api/bots/${initial.id}` : "/api/bots", {
        method: initial ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { ok: boolean; bot?: Bot; error?: string };
      if (!res.ok || !data.ok || !data.bot) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      onSaved(data.bot);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed to save bot");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="space-y-4 rounded-xl border border-border bg-surface p-4 sm:p-5"
    >
      <div>
        <label className="text-xs font-medium text-muted">Name</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Morning research brief"
          className="mt-1.5 h-10 w-full rounded-md border border-border bg-raised px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Acting seats</label>
        <div className="mt-1.5 flex flex-wrap gap-2">
          {SEATS.map((s) => {
            const on = seatIds.includes(s.id);
            const isChair = s.chair;
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => {
                  if (!isChair) toggleSeat(s.id);
                }}
                title={isChair ? "The chair is always seated" : s.mandate}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  isChair
                    ? "bg-accent/20 text-accent ring-1 ring-border-strong"
                    : on
                      ? "bg-raised text-fg ring-1 ring-border-strong"
                      : "text-muted hover:bg-raised/60 hover:text-fg"
                }`}
              >
                {s.name} · {s.role}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-subtle">
          {seatIds.length} seat{seatIds.length === 1 ? "" : "s"} · the chair
          seals the verdict.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Schedule (cron, optional)</label>
        <input
          value={schedule}
          onChange={(e) => setSchedule(e.target.value)}
          placeholder="*/15 * * * *"
          className="mt-1.5 h-10 w-full rounded-md border border-border bg-raised px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <p className="mt-1.5 text-xs text-subtle">
          Leave empty for on-demand runs only. 5 fields, minute first.
        </p>
      </div>

      <div>
        <label className="text-xs font-medium text-muted">Standing task</label>
        <textarea
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="What the bot does each time it runs (required for scheduled bots)"
          rows={3}
          className="mt-1.5 w-full resize-none rounded-md border border-border bg-raised px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="h-10 rounded-md bg-accent px-5 text-sm font-medium text-accent-fg disabled:opacity-40"
        >
          {saving ? "Saving…" : initial ? "Save changes" : "Create bot"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-md border border-border px-4 text-sm text-muted hover:text-fg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function BotCard({ bot, onEdit }: { bot: Bot; onEdit: () => void }) {
  const seats = resolveSeats(bot.seatIds, bot.chairId).seats;
  return (
    <article className="rounded-xl border border-border bg-surface p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-medium text-fg">{bot.name}</h3>
          <p className="mt-0.5 font-mono text-[10px] text-subtle">{shortId(bot.id)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {bot.schedule && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 font-mono text-[10px] text-accent">
              {bot.schedule}
            </span>
          )}
          <button
            type="button"
            onClick={onEdit}
            className="text-xs text-muted hover:text-fg"
          >
            Edit
          </button>
        </div>
      </div>

      {bot.task && (
        <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted">{bot.task}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-1.5">
        {seats.map((s: Seat) => (
          <span
            key={s.id}
            title={s.mandate}
            className="inline-flex items-center gap-1 rounded-md bg-raised px-2 py-1 text-[10px] text-muted ring-1 ring-border"
          >
            <span className="font-mono">{s.initials}</span>
            {s.name}
          </span>
        ))}
      </div>
    </article>
  );
}

export function Bots() {
  const [bots, setBots] = useState<Bot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<Bot | null>(null);
  const [creating, setCreating] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bots?userId=${encodeURIComponent(OPERATOR_ID)}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Failed to load bots (${res.status})`);
      const data = (await res.json()) as { ok: boolean; bots: Bot[] };
      if (mounted.current) {
        setBots(data.bots ?? []);
        setError(null);
      }
    } catch (err) {
      if (mounted.current) {
        setError(err instanceof Error ? err.message : "Failed to load bots");
      }
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  async function runBot(id: string) {
    setRunningId(id);
    setNotice(null);
    try {
      const bot = bots?.find((b) => b.id === id);
      const task = bot?.task?.trim();
      if (!task) {
        setNotice("This bot has no standing task. Add one (Edit) to run it.");
        return;
      }
      const res = await fetch(`/api/bots/${id}/run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: OPERATOR_ID, task }),
      });
      const data = (await res.json()) as { ok: boolean; runId?: string; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || `Run failed (${res.status})`);
      }
      setNotice(`Queued run ${shortId(data.runId ?? "")} — track it in Runs.`);
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Failed to queue run");
    } finally {
      setRunningId(null);
    }
  }

  async function removeBot(id: string) {
    if (!window.confirm("Delete this bot? Past runs are kept.")) return;
    try {
      const res = await fetch(`/api/bots/${id}?userId=${encodeURIComponent(OPERATOR_ID)}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`Delete failed (${res.status})`);
      setBots((cur) => (cur ?? []).filter((b) => b.id !== id));
      if (editing?.id === id) setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete bot");
    }
  }

  const editingOpen = creating || editing !== null;

  return (
    <div className="mx-auto max-w-3xl px-4 py-8 sm:px-8">
      <header className="flex items-end justify-between gap-4">
        <div>
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
            Bots
          </p>
          <h1 className="font-display mt-1 text-3xl tracking-tight">
            Workers that act
          </h1>
          <p className="mt-2 max-w-xl text-sm text-muted">
            Persistent bots with a standing task and an optional schedule. They
            run through the council — seats gather evidence, write code, and the
            chair seals a verdict with any dissent.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreating(true);
            setEditing(null);
            setError(null);
          }}
          className="h-10 shrink-0 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          New bot
        </button>
      </header>

      {error && (
        <p className="mt-6 rounded-lg border border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          {error}
        </p>
      )}
      {notice && (
        <p className="mt-6 rounded-lg border border-border bg-raised/50 p-4 text-sm text-muted">
          {notice}
        </p>
      )}

      {editingOpen && (
        <div className="mt-6">
          <BotForm
            initial={editing ?? undefined}
            onCancel={() => {
              setCreating(false);
              setEditing(null);
            }}
            onSaved={(bot) => {
              setBots((cur) => {
                const list = cur ?? [];
                const idx = list.findIndex((b) => b.id === bot.id);
                if (idx >= 0) {
                  const next = [...list];
                  next[idx] = bot;
                  return next;
                }
                return [bot, ...list];
              });
              setCreating(false);
              setEditing(null);
              setNotice(null);
            }}
            onError={(msg) => setError(msg)}
          />
        </div>
      )}

      <div className="mt-8 space-y-3">
        {bots === null && !error && (
          <p className="text-sm text-muted">Loading…</p>
        )}
        {bots !== null && bots.length === 0 && (
          <p className="text-sm text-muted">
            No bots yet. Create one to give the council a standing job.
          </p>
        )}
        {bots?.map((b) => (
          <div key={b.id} className="space-y-2">
            <BotCard
              bot={b}
              onEdit={() => {
                setEditing(b);
                setCreating(false);
                setError(null);
              }}
            />
            <div className="flex gap-2 pl-1">
              <button
                type="button"
                onClick={() => runBot(b.id)}
                disabled={runningId === b.id}
                className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg disabled:opacity-40"
              >
                {runningId === b.id ? "Queueing…" : "Run now"}
              </button>
              <button
                type="button"
                onClick={() => removeBot(b.id)}
                className="h-8 rounded-md px-3 text-xs text-danger hover:opacity-80"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
