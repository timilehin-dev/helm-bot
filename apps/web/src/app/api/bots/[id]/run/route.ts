import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { getBot } from "@/lib/bots";
import { queueBotRun } from "@/lib/queue";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

type Body = {
  userId?: string;
  task?: string;
};

/**
 * Run a bot by id → `inngest.send()`.
 *
 * This is the canonical "Core flow" entrypoint (ARCHITECTURE.md §"Core flow").
 * It loads the persisted bot, then delegates to `queueBotRun`, which resolves
 * acting seats, looks up the owner's non-secret provider metadata, and queues a
 * durable run. The owner is sourced from the signed session (Phase 4); the body
 * `userId` is only a local-mode fallback. The encrypted LLM key is referenced
 * only by its Redis key — decryption happens inside the Inngest function.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const task = typeof body.task === "string" ? body.task.trim() : "";
  if (!task) {
    return NextResponse.json({ ok: false, error: "task is required" }, { status: 400 });
  }

  const resolved = resolveUserId(req, body.userId?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const userId = resolved.userId;

  const bot = await getBot(userId, id);
  if (!bot) {
    return NextResponse.json({ ok: false, error: "Bot not found" }, { status: 404 });
  }

  try {
    const runId = await queueBotRun(bot, task);
    return NextResponse.json({ ok: true, runId, botId: bot.id });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to queue run" },
      { status: 500 },
    );
  }
}