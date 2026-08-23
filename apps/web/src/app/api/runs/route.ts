import { NextRequest, NextResponse } from "next/server";
import { inngest, QuorumEvents, type BotRunRequestedData } from "@/inngest/client";
import { llmKeyRefFor } from "@/lib/redis";
import type { Seat } from "@quorum/shared";

export const runtime = "nodejs";

type Body = {
  botId: string;
  task: string;
  /** Optional: acting seats. Defaults to the canonical v2 SEATS. */
  seats?: Seat[];
  chairId?: string;
  userId: string;
  llm: { provider: string; baseUrl: string; model: string };
};

/**
 * Assign a task to a bot → `inngest.send()`.
 *
 * This is the entrypoint of the core flow (ARCHITECTURE.md §"Core flow"). The
 * user's encrypted LLM key is referenced by its Redis key; Inngest fetches +
 * decrypts it inside the durable function and forwards it to Modal.
 */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.task?.trim() || !body.botId || !body.userId) {
    return NextResponse.json(
      { ok: false, error: "botId, userId, and task are required" },
      { status: 400 },
    );
  }

  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const data: BotRunRequestedData = {
    runId,
    botId: body.botId,
    task: body.task,
    seats: body.seats ?? [],
    chairId: body.chairId ?? "",
    llmKeyRef: llmKeyRefFor(body.userId),
    llm: body.llm,
  };

  try {
    await inngest.send({ name: QuorumEvents.BotRunRequested, data });
    return NextResponse.json({ ok: true, runId });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to queue run" },
      { status: 500 },
    );
  }
}
