import { NextRequest, NextResponse } from "next/server";
import { getRun } from "@/lib/runs";

export const runtime = "nodejs";

type Params = { params: Promise<{ id: string }> };

/**
 * Get a single run's persisted state (namespaced by userId).
 *
 * Complements the live SSE feed (`/api/runs/[id]/stream`): this returns the
 * latest durable snapshot (status, steps, verdict, dissent) regardless of
 * whether a live subscriber is attached.
 */
export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const userId = req.nextUrl.searchParams.get("userId")?.trim();
  if (!userId) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }
  const run = await getRun(userId, id);
  if (!run) {
    return NextResponse.json({ ok: false, error: "Run not found" }, { status: 404 });
  }
  return NextResponse.json({ ok: true, run });
}
