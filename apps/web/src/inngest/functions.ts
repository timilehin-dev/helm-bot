import { inngest, QuorumEvents, type BotRunRequestedData } from "./client";

/**
 * The durable bot-run function.
 *
 * Phase 1 scaffold: it currently publishes lifecycle events to Redis pub/sub
 * (so the SSE feed already has something to show) and records a sealed verdict
 * placeholder. Phase 2 swaps the "run agent" step for a real Modal invocation.
 */
export const runBot = inngest.createFunction(
  { id: "run-bot", name: "Run a Quorum bot", retries: 3 },
  { event: QuorumEvents.BotRunRequested },
  async ({ event, step, logger }) => {
    const data: BotRunRequestedData = event.data;
    logger.info("Running bot", { runId: data.runId, botId: data.botId });

    await step.run("mark-running", async () => {
      await publish(data.runId, { type: "run:started", runId: data.runId, at: Date.now() });
      return "running";
    });

    // Phase 2: fetch + decrypt the LLM key, invoke the Modal agent function,
    // stream per-step progress back through Redis pub/sub.
    const decryptedKeyPresent = await step.run("load-llm-key", async () => {
      const { getEncryptedKey } = await import("@/lib/llm-key-store");
      const enc = await getEncryptedKey(data.llmKeyRef);
      return Boolean(enc);
    });

    if (!decryptedKeyPresent) {
      await publish(data.runId, {
        type: "run:failed",
        runId: data.runId,
        error: "No LLM key stored for this user. Add one in Settings.",
        at: Date.now(),
      });
      return { status: "failed", reason: "missing-llm-key" };
    }

    await step.run("run-agent", async () => {
      await publish(data.runId, {
        type: "step:started",
        runId: data.runId,
        step: {
          id: "plan",
          seatId: data.chairId,
          kind: "plan",
          title: "Planning task",
          status: "running",
          at: Date.now(),
        },
      });
      await publish(data.runId, {
        type: "step:done",
        runId: data.runId,
        step: {
          id: "plan",
          seatId: data.chairId,
          kind: "plan",
          title: "Planning task",
          status: "done",
          detail: "Modal agent loop not yet wired (Phase 2).",
          at: Date.now(),
        },
      });
      return "planned";
    });

    await step.run("seal", async () => {
      await publish(data.runId, {
        type: "run:sealed",
        runId: data.runId,
        verdict: "Run queued. Modal agent loop arrives in Phase 2.",
        dissent: "None recorded.",
        at: Date.now(),
      });
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
