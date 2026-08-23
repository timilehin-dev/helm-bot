import { NextRequest, NextResponse } from "next/server";
import { getBot, parseBotDraft, removeBot, updateBot } from "@/lib/bots";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

type Body = {
  userId?: string;
  [k: string]: unknown;
};

/** GET a single bot by id (namespaced by userId). */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }
  const bot = await getBot(userId, id);
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

  const userId = typeof body.userId === "string" ? body.userId.trim() : "";
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

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
  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }
  const removed = await removeBot(userId, id);
  if (!removed) {
    return NextResponse.json({ ok: false, error: "Bot not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true });
}