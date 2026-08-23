import { NextRequest, NextResponse } from "next/server";
import { createBot, listBots, parseBotDraft } from "@/lib/bots";

export const runtime = "nodejs";

/**
 * Bot registry (namespaced by user id).
 *
 * GET  /api/bots?userId=...   → the user's bots
 * POST /api/bots               → create a bot
 *
 * The user id identifies the operator for BYOK resolution; it will be sourced
 * from auth (Phase 4) rather than a query/body field. Bots are stored in Redis
 * behind the `@/lib/bots` domain module.
 */

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }
  const bots = await listBots(userId);
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
  const ownerId = typeof userId === "string" ? userId.trim() : "";
  if (!ownerId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

  const parsed = parseBotDraft(rest, ownerId);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const bot = await createBot(ownerId, parsed.draft);
  return NextResponse.json({ ok: true, bot }, { status: 201 });
}