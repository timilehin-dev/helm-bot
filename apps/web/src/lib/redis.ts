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
