import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { getBot, parseBotDraft, removeBot, updateBot } from "@/lib/bots";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

type Body = {
  userId?: string;
  [k: string]: unknown;
};

/** GET a single bot by id (namespaced by the session owner). */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const resolved = resolveUserId(req, req.nextUrl.searchParams.get("userId")?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const bot = await getBot(resolved.userId, id);
  if (!bot) {
    return NextResponse.json({ ok: false, error: "Bot not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, bot });
}

/** PATCH editable fields (name/seatIds/chairId/schedule) of a bot. */
export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const resolved = resolveUserId(req, body.userId?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const userId = resolved.userId;

  const rest: Record<string, unknown> = { ...body };
  delete rest.userId;
  const parsed = parseBotDraft(rest, userId);
  if (!parsed.ok) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  const updated = await updateBot(userId, id, parsed.draft);
  if (!updated) {
    return NextResponse.json({ ok: false, error: "Bot not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, bot: updated });
}

/** DELETE a bot. */
export async function DELETE(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const resolved = resolveUserId(req, req.nextUrl.searchParams.get("userId")?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }
  const removed = await removeBot(resolved.userId, id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Bot not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}