import { randomUUID } from "node:crypto";
import type { Bot, BotDraft, Seat } from "@quorum/shared";
import { SEATS } from "@quorum/shared";
import {
  deleteBot as redisDeleteBot,
  getBot as redisGetBot,
  listBotIds,
  putBot,
} from "./redis";

/**
 * Bot domain module.
 *
 * Bots are a *persistent registry* (Redis) namespaced by owner. This is the
 * foundation for Phase 3's always-on / scheduled bots: a bot can be created,
 * listed, edited, and triggered to run on demand. The actual run delegates to
 * Inngest (see `POST /api/bots/[id]/run`), which fetches + decrypts the BYOK
 * key and invokes the Modal agent.
 */

export function createBotId(): string {
  return `bot_${randomUUID().replace(/-/g, "")}`;
}

/** Validate + normalize an untrusted bot draft from a request body. */
export function parseBotDraft(
  input: unknown,
  ownerId: string,
): { ok: true; draft: BotDraft } | { ok: false; error: string } {
  const d = (input ?? {}) as Record<string, unknown>;

  const name = typeof d.name === "string" ? d.name.trim() : "";
  if (!name) return { ok: false, error: "name is required" };

  const seatIds = Array.isArray(d.seatIds)
    ? d.seatIds
        .filter((s): s is string => typeof s === "string")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const chairId = typeof d.chairId === "string" ? d.chairId.trim() : "";
  const schedule =
    typeof d.schedule === "string" && d.schedule.trim() ? d.schedule.trim() : undefined;

  const draft: BotDraft = {
    name,
    seatIds,
    chairId,
    ownerId,
  };
  if (schedule) draft.schedule = schedule;

  return { ok: true, draft };
}

export async function createBot(ownerId: string, draft: BotDraft): Promise<Bot> {
  const bot: Bot = {
    id: createBotId(),
    name: draft.name,
    seatIds: draft.seatIds,
    chairId: draft.chairId,
    ownerId,
    createdAt: Date.now(),
  };
  if (draft.schedule) bot.schedule = draft.schedule;
  await putBot(ownerId, bot);
  return bot;
}

export async function listBots(ownerId: string): Promise<Bot[]> {
  const ids = await listBotIds(ownerId);
  const bots = await Promise.all(ids.map((id) => redisGetBot<Bot>(ownerId, id)));
  return bots.filter((b): b is Bot => b !== null);
}

export async function getBot(ownerId: string, botId: string): Promise<Bot | null> {
  return redisGetBot<Bot>(ownerId, botId);
}

export async function updateBot(
  ownerId: string,
  botId: string,
  patch: Partial<BotDraft>,
): Promise<Bot | null> {
  const existing = await getBot(ownerId, botId);
  if (!existing) return null;

  const updated: Bot = {
    ...existing,
    ...patch,
    id: botId, // never reassignable
    ownerId, // never reassignable
    createdAt: existing.createdAt,
  };
  await putBot(ownerId, updated);
  return updated;
}

export async function removeBot(ownerId: string, botId: string): Promise<boolean> {
  const existing = await getBot(ownerId, botId);
  if (!existing) return false;
  await redisDeleteBot(ownerId, botId);
  return true;
}

/**
 * Resolve the acting seats for a run from the bot's `seatIds` + `chairId`.
 *
 * Empty `seatIds` → the full canonical council. The chair seat is always
 * included (even if only specialists are listed) so the loop can seal.
 */
export function resolveSeats(
  seatIds: string[],
  chairId: string,
): { seats: Seat[]; chairId: string } {
  const canonicalChair = SEATS.find((s) => s.chair) ?? SEATS[0];
  const resolvedChairId = SEATS.some((s) => s.id === chairId)
    ? chairId
    : canonicalChair.id;

  const wanted = new Set(seatIds.length ? seatIds : SEATS.map((s) => s.id));
  wanted.add(resolvedChairId);
  const seats = SEATS.filter((s) => wanted.has(s.id));

  return { seats, chairId: resolvedChairId };
}