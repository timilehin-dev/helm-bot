import { NextRequest, NextResponse } from "next/server";
import { inngest, QuorumEvents, type BotRunRequestedData } from "@/inngest/client";
import { getBot, resolveSeats } from "@/lib/bots";
import { getProviderMeta, llmKeyRefFor } from "@/lib/redis";

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
 * It loads the persisted bot, resolves its acting seats, looks up the owner's
 * non-secret provider metadata, and queues a durable run. The encrypted LLM key
 * is referenced only by its Redis key — decryption happens inside the Inngest
 * function and is forwarded to Modal as a body field.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  const task = typeof body.task === "string" ? body.task.trim() : "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }
  if (!task) {
    return NextResponse.json({ ok: false, error: "task is required" }, { status: 400 });
  }

  const bot = await getBot(userId, id);
  if (!bot) {
    return NextResponse.json({ ok: false, error: "Bot not found" }, { status: 404 });
  }

  const providerMeta = await getProviderMeta(userId);
  const { seats, chairId } = resolveSeats(bot.seatIds, bot.chairId);

  const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const data: BotRunRequestedData = {
    runId,
    botId: bot.id,
    task,
    seats,
    chairId,
    llmKeyRef: llmKeyRefFor(userId),
    llm: {
      provider: providerMeta?.provider ?? "openai",
      baseUrl: providerMeta?.baseUrl ?? "https://api.openai.com/v1",
      model: providerMeta?.model ?? "gpt-4o",
    },
  };

  try {
    await inngest.send({ name: QuorumEvents.BotRunRequested, data });
    return NextResponse.json({ ok: true, runId, botId: bot.id });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to queue run" },
      { status: 500 },
    );
  }
}