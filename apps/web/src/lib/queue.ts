import type { Bot, BotRun } from "@quorum/shared";
import { inngest, QuorumEvents } from "@/inngest/client";
import type { BotRunRequestedData } from "@/inngest/client";
import { resolveSeats } from "@/lib/bots";
import { createRun } from "@/lib/runs";
import { getProviderMeta, llmKeyRefFor } from "@/lib/redis";

/**
 * Shared "queue a bot run" pipeline.
 *
 * Both the on-demand `POST /api/bots/[id]/run` route and the Phase-3 cron
 * dispatcher converge here: load provider meta, resolve acting seats, create a
 * persisted `queued` run record, and send the durable `BotRunRequested` event.
 * Returns the assigned run id (or null if the Inngest send failed).
 */
export async function queueBotRun(bot: Bot, task: string): Promise<string | null> {
  const userId = bot.ownerId;
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
    ownerId: userId,
    llm: {
      provider: providerMeta?.provider ?? "openai",
      baseUrl: providerMeta?.baseUrl ?? "https://api.openai.com/v1",
      model: providerMeta?.model ?? "gpt-4o",
    },
  };

  const run: BotRun = {
    id: runId,
    botId: bot.id,
    task,
    seatIds: seats.map((s) => s.id),
    chairId,
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
  return runId;
}