import Redis, { type Redis as RedisClient } from "ioredis";
import type { EncryptedPayload, LlmConfig } from "@quorum/shared";

/**
 * Redis (Upstash) client + pub/sub for Quorum v2.
 *
 * Holds: bot/run state, encrypted per-user LLM keys, and the pub/sub channel
 * the SSE feed subscribes to for live bot activity streamed from Modal/Inngest.
 *
 * If no REDIS_URL is configured (local dev without Upstash), we fall back to a
 * no-op shim so the app still builds and runs; live features simply stay quiet
 * until a Redis is configured.
 */

const REDIS_URL = process.env.REDIS_URL || process.env.UPSTASH_REDIS_REST_URL;

let _client: RedisClient | null = null;

function client(): RedisClient | null {
  if (!REDIS_URL) return null;
  if (!_client) {
    _client = new Redis(REDIS_URL, {
      maxRetriesPerRequest: 3,
      lazyConnect: false,
    });
  }
  return _client;
}

/** Channel name for a given run's live event stream. */
export function runChannel(runId: string) {
  return `quorum:run:${runId}`;
}

/** Key for a run's state blob. */
export function runKey(runId: string) {
  return `quorum:run:${runId}:state`;
}

/** Key for a user's encrypted LLM key. */
export function llmKeyRefFor(userId: string) {
  return `quorum:llmkey:${userId}`;
}

/** Key for a user's non-secret provider metadata (provider/baseUrl/model). */
export function providerMetaKeyFor(userId: string) {
  return `quorum:llmmeta:${userId}`;
}

/** Store a user's encrypted LLM key payload. */
export async function setEncryptedKey(
  keyRef: string,
  payload: EncryptedPayload,
): Promise<void> {
  const c = client();
  if (!c) return;
  await c.set(keyRef, JSON.stringify(payload));
}

/** Fetch a user's encrypted LLM key payload. */
export async function getEncryptedKey(
  keyRef: string,
): Promise<EncryptedPayload | null> {
  const c = client();
  if (!c) return null;
  const raw = await c.get(keyRef);
  return raw ? (JSON.parse(raw) as EncryptedPayload) : null;
}

/** Store non-secret provider metadata (provider/baseUrl/model). */
export async function setProviderMeta(
  userId: string,
  meta: LlmConfig,
): Promise<void> {
  const c = client();
  if (!c) return;
  await c.set(providerMetaKeyFor(userId), JSON.stringify(meta));
}

/** Fetch non-secret provider metadata. */
export async function getProviderMeta(
  userId: string,
): Promise<LlmConfig | null> {
  const c = client();
  if (!c) return null;
  const raw = await c.get(providerMetaKeyFor(userId));
  return raw ? (JSON.parse(raw) as LlmConfig) : null;
}

/** Key for a single bot record (namespaced by owner). */
export function botKey(ownerId: string, botId: string) {
  return `quorum:bot:${ownerId}:${botId}`;
}

/** Sorted-set key listing a user's bot ids (score = createdAt). */
export function botIndexKey(ownerId: string) {
  return `quorum:bots:${ownerId}`;
}

/** Reverse index: bot id → owning user id (lets the Phase-3 cron find a bot's
 *  owner starting from a global bot id). */
export function botOwnerKey(botId: string) {
  return `quorum:botowner:${botId}`;
}

/** Global set of bot ids that currently have a schedule (Phase 3 cron input). */
export function scheduledBotsKey() {
  return `quorum:schedule:all`;
}

/** Record a bot's owner in the reverse index. */
export async function setBotOwner(botId: string, ownerId: string): Promise<void> {
  const c = client();
  if (!c) return;
  await c.set(botOwnerKey(botId), ownerId);
}

/** Look up a bot's owner by id (null if unknown). */
export async function getBotOwner(botId: string): Promise<string | null> {
  const c = client();
  if (!c) return null;
  return c.get(botOwnerKey(botId));
}

/** Drop a bot's reverse-index entry (used on delete). */
export async function unsetBotOwner(botId: string): Promise<void> {
  const c = client();
  if (!c) return;
  await c.del(botOwnerKey(botId));
}

/** Add a bot id to the global scheduled set. */
export async function indexScheduled(botId: string): Promise<void> {
  const c = client();
  if (!c) return;
  await c.sadd(scheduledBotsKey(), botId);
}

/** Remove a bot id from the global scheduled set. */
export async function unindexScheduled(botId: string): Promise<void> {
  const c = client();
  if (!c) return;
  await c.srem(scheduledBotsKey(), botId);
}

/** List all bot ids globally that currently carry a schedule. */
export async function listScheduledBotIds(): Promise<string[]> {
  const c = client();
  if (!c) return [];
  return c.smembers(scheduledBotsKey());
}

/** Load a single bot record by id. */
export async function getBot<T>(ownerId: string, botId: string): Promise<T | null> {
  const c = client();
  if (!c) return null;
  const raw = await c.get(botKey(ownerId, botId));
  return raw ? (JSON.parse(raw) as T) : null;
}

/** List a user's bot ids, most-recently-created first. */
export async function listBotIds(ownerId: string): Promise<string[]> {
  const c = client();
  if (!c) return [];
  return c.zrange(botIndexKey(ownerId), 0, -1, "REV");
}

/** Register/update a bot record and index it for the owner. */
export async function putBot<T>(
  ownerId: string,
  bot: T & { id: string; createdAt: number; schedule?: string },
): Promise<void> {
  const c = client();
  if (!c) return;
  const key = botKey(ownerId, bot.id);
  await c.set(key, JSON.stringify(bot));
  await c.zadd(botIndexKey(ownerId), bot.createdAt, bot.id);
  await setBotOwner(bot.id, ownerId);
  if (bot.schedule) {
    await indexScheduled(bot.id);
  } else {
    await unindexScheduled(bot.id);
  }
}

/** Remove a bot record and drop it from the owner's index. */
export async function deleteBot(ownerId: string, botId: string): Promise<void> {
  const c = client();
  if (!c) return;
  await c.del(botKey(ownerId, botId));
  await c.zrem(botIndexKey(ownerId), botId);
  await unsetBotOwner(botId);
  await unindexScheduled(botId);
}

/** Publish a run event to pub/sub (consumed by the SSE route). */
export async function publishRunEvent(runId: string, event: unknown): Promise<void> {
  const c = client();
  if (!c) return;
  await c.publish(runChannel(runId), JSON.stringify(event));
}

/** Persist a run's state. */
export async function setRunState<T>(runId: string, state: T): Promise<void> {
  const c = client();
  if (!c) return;
  await c.set(runKey(runId), JSON.stringify(state));
}

/** Load a run's state. */
export async function getRunState<T>(runId: string): Promise<T | null> {
  const c = client();
  if (!c) return null;
  const raw = await c.get(runKey(runId));
  return raw ? (JSON.parse(raw) as T) : null;
}

/** Sorted-set key listing a user's run ids (score = createdAt). */
export function runIndexKey(ownerId: string) {
  return `quorum:runs:${ownerId}`;
}

/** Register a run id in the owner's index (most-recent first on list). */
export async function indexRun(ownerId: string, runId: string, createdAt: number): Promise<void> {
  const c = client();
  if (!c) return;
  await c.zadd(runIndexKey(ownerId), createdAt, runId);
}

/** List a user's run ids, most-recent first. */
export async function listRunIds(ownerId: string): Promise<string[]> {
  const c = client();
  if (!c) return [];
  return c.zrange(runIndexKey(ownerId), 0, -1, "REV");
}

/** Persist a run's state and index it under its owner. */
export async function putRunState<T>(
  ownerId: string,
  runId: string,
  createdAt: number,
  state: T,
): Promise<void> {
  await setRunState(runId, state);
  await indexRun(ownerId, runId, createdAt);
}

/**
 * Subscribe to a run's live channel. Returns an unsubscribe function.
 *
 * Returns null (and logs) when Redis isn't configured, so the SSE route can
 * fall back to a polling or no-stream mode.
 */
export function subscribeRun(
  runId: string,
  onEvent: (event: unknown) => void,
): Promise<() => void> | null {
  if (!REDIS_URL) return null;
  // A separate connection is required for subscribing — ioredis subscribers
  // can't run regular commands on the same connection.
  const sub = new Redis(REDIS_URL, { maxRetriesPerRequest: null });
  const channel = runChannel(runId);
  sub.subscribe(channel);
  sub.on("message", (_ch, msg) => {
    if (_ch !== channel) return;
    try {
      onEvent(JSON.parse(msg));
    } catch {
      /* ignore malformed frames */
    }
  });
  return Promise.resolve(() => {
    sub.unsubscribe(channel).catch(() => {});
    sub.quit().catch(() => {});
  });
}
