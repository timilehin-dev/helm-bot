import { Inngest, EventSchemas } from "inngest";

/**
 * Quorum v2 Inngest client.
 *
 * Inngest is the durable orchestration layer: it triggers Modal agent runs,
 * retries on failure, and (Phase 3) drives always-on bots via cron.
 *
 * Infra-only identity. No user LLM keys are ever embedded here — those are
 * fetched + decrypted inside step functions from the Redis key store.
 */

/** All Quorum event channels. */
export const QuorumEvents = {
  /** A bot was assigned a task in the UI. */
  BotRunRequested: "quorum/bot.run.requested",
  /** A scheduled bot fired (Phase 3 cron). */
  BotScheduleFired: "quorum/bot.schedule.fired",
} as const;

/**
 * Data attached to a `quorum/bot.run.requested` event.
 *
 * `llmKeyRef` is the Redis key where the user's *encrypted* LLM API key is
 * stored. Inngest fetches + decrypts it inside a step and forwards the plain
 * value to Modal — it never touches the database or the UI after that.
 */
export interface BotRunRequestedData {
  runId: string;
  botId: string;
  task: string;
  seatIds: string[];
  chairId: string;
  /** Redis key for the encrypted LLM key, e.g. `quorum:llmkey:<userId>`. */
  llmKeyRef: string;
  llm: { provider: string; baseUrl: string; model: string };
}

/** Typed events so `inngest.send` and step functions stay type-safe. */
const schemas = new EventSchemas().fromRecord<{
  [QuorumEvents.BotRunRequested]: { data: BotRunRequestedData };
  [QuorumEvents.BotScheduleFired]: { data: { botId: string; at: number } };
}>();

export const inngest = new Inngest({
  id: "quorum-v2",
  name: "Quorum v2",
  schemas,
});
