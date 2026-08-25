import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { createBot, listBots, parseBotDraft } from "@/lib/bots";

export const runtime = "nodejs";

/**
 * Bot registry (namespaced by user id).
 *
 * GET  /api/bots?userId=...   → the user's bots
 * POST /api/bots               → create a bot
 *
 * The owner id is sourced from the signed session (Phase 4). The query/body
 * `userId` is accepted only as a fallback for single-operator local mode when
 * GitHub auth is unset. Bots are stored in Redis behind `@/lib/bots`.
 */

export async function GET(req: NextRequest) {
  const resolved = resolveUserId(req, req.nextUrl.searchParams.get("userId")?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const bots = await listBots(resolved.userId);
  return NextResponse.json({ ok: true, bots });
}

export async function POST(req: NextRequest) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const { userId, ...rest } = (body ?? {}) as Record<string, unknown> & {
    userId?: string;
  };
  const resolved = resolveUserId(req, typeof userId === "string" ? userId.trim() : undefined);
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const ownerId = resolved.userId;

  const parsed = parseBotDraft(rest, ownerId);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const bot = await createBot(ownerId, parsed.draft);
  return NextResponse.json({ ok: true, bot }, { status: 201 });
}