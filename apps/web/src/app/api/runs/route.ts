import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { inngest, QuorumEvents, type BotRunRequestedData } from "@/inngest/client";
import { llmKeyRefFor } from "@/lib/redis";
import { createRun, listRuns } from "@/lib/runs";
import type { BotRun, Seat } from "@quorum/shared";

export const runtime = "nodejs";

type Body = {
  botId: string;
  task: string;
  /** Optional: acting seats. Defaults to the canonical v2 SEATS. */
  seats?: Seat[];
  chairId?: string;
  /** Local-mode fallback only; ignored when a session is present. */
  userId?: string;
  llm: { provider: string; baseUrl: string; model: string };
};

/**
 * Run registry.
 *
 * GET  /api/runs?userId=...   → the user's runs, most-recent first
 * POST /api/runs               → assign a task to a bot (queues a run)
 */
export async function GET(req: NextRequest) {
  const resolved = resolveUserId(req, req.nextUrl.searchParams.get("userId")?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const runs = await listRuns(resolved.userId);
  return NextResponse.json({ ok: true, runs });
}

/**
 * Assign a task to a bot → `inngest.send()`.
 *
 * This is the entrypoint of the core flow (ARCHITECTURE.md §"Core flow"). The
 * owner is sourced from the signed session (Phase 4); the body `userId` is only
 * a local-mode fallback. The user's encrypted LLM key is referenced by its Redis
 * key; Inngest fetches + decrypts it inside the durable function.
 */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.task?.trim() || !body.botId) {
    return NextResponse.json(
      { ok: false, error: "botId and task are required" },
      { status: 400 },
    );
  }

  const resolved = resolveUserId(req, body.userId?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const userId = resolved.userId;

  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const data: BotRunRequestedData = {
    runId,
    botId: body.botId,
    task: body.task,
    seats: body.seats ?? [],
    chairId: body.chairId ?? "",
    llmKeyRef: llmKeyRefFor(userId),
    ownerId: userId,
    llm: body.llm,
  };

  try {
    const run: BotRun = {
      id: runId,
      botId: body.botId,
      task: body.task,
      seatIds: data.seats.map((s) => s.id),
      chairId: data.chairId,
      status: "queued",
      steps: [],
      positions: [],
      verdict: "",
      dissent: "",
      ownerId: userId,
      createdAt: Date.now(),
    };
    await createRun(run);
    await inngest.send({ name: QuorumEvents.BotRunRequested, data });
    return NextResponse.json({ ok: true, runId });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to queue run" },
      { status: 500 },
    );
  }
}
