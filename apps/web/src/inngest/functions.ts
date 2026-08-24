import { inngest, QuorumEvents, type BotRunRequestedData } from "./client";
import { SEATS } from "@quorum/shared";

/**
 * The durable bot-run function.
 *
 * It fetches + decrypts the user's BYOK key inside a step (never logs it),
 * then invokes the Modal Python agent over HTTPS. The Modal agent runs the full
 * loop — plan, browse, shell, fs, search, synthesize — and streams per-step
 * progress to Redis pub/sub for the SSE feed. This function just relays
 * lifecycle markers so the UI still shows something even before Modal lands.
 */
export const runBot = inngest.createFunction(
  { id: "run-bot", name: "Run a Quorum bot", retries: 3 },
  { event: QuorumEvents.BotRunRequested },
  async ({ event, step, logger }) => {
    const data: BotRunRequestedData = event.data;
    logger.info("Running bot", { runId: data.runId, botId: data.botId });

    await step.run("mark-running", async () => {
      await publish(data.runId, { type: "run:started", runId: data.runId, at: Date.now() });
      const { markRunning } = await import("@/lib/runs");
      await markRunning(data.ownerId, data.runId);
      return "running";
    });

    // Fetch + decrypt the LLM key. The plain value stays inside this step.
    const apiKey = await step.run("load-llm-key", async () => {
      const { getDecryptedKey } = await import("@/lib/llm-key-store");
      return getDecryptedKey(data.llmKeyRef);
    });

    if (!apiKey) {
      await publish(data.runId, {
        type: "run:failed",
        runId: data.runId,
        error: "No LLM key stored for this user. Add one in Settings.",
        at: Date.now(),
      });
      const { failRun } = await import("@/lib/runs");
      await failRun(data.ownerId, data.runId, "No LLM key stored for this user. Add one in Settings.");
      return { status: "failed", reason: "missing-llm-key" };
    }

    const result = await step.run("run-agent", async () => {
      const { invokeModalAgent } = await import("@/lib/modal");

      const res = await invokeModalAgent({
        runId: data.runId,
        task: data.task,
        seats: data.seats?.length ? data.seats : SEATS,
        chairId: data.chairId || SEATS.find((s) => s.chair)?.id || "",
        apiKey,
        llm: data.llm,
        infra: {
          tavilyApiKey: process.env.TAVILY_API_KEY,
          redisUrl: process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL,
        },
      });

      if (!res.ok) {
        const error = res.unconfigured
          ? "Modal agent not deployed (MODAL_AGENT_URL unset). Deploy modal/agent.py."
          : res.error || "Modal agent failed";
        await publish(data.runId, { type: "run:failed", runId: data.runId, error, at: Date.now() });
        const { failRun } = await import("@/lib/runs");
        await failRun(data.ownerId, data.runId, error);
        return { ok: false as const, error };
      }

      return { ok: true as const, verdict: res.verdict, dissent: res.dissent };
    });

    if (!result.ok) {
      return { status: "failed", reason: result.error };
    }

    await step.run("seal", async () => {
      const verdict = result.verdict ?? "Sealed.";
      const dissent = result.dissent ?? "None recorded.";
      await publish(data.runId, {
        type: "run:sealed",
        runId: data.runId,
        verdict,
        dissent,
        at: Date.now(),
      });
      const { sealRun } = await import("@/lib/runs");
      await sealRun(data.ownerId, data.runId, verdict, dissent);
      return "sealed";
    });

    return { status: "sealed", runId: data.runId };
  },
);

/** Publish a run event to the Redis pub/sub channel the SSE feed listens on. */
async function publish(runId: string, event: unknown) {
  const { publishRunEvent } = await import("@/lib/redis");
  await publishRunEvent(runId, event);
}

export const functions = [runBot];
