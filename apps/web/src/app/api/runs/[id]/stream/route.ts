import { NextRequest, NextResponse } from "next/server";
import { authRequired, resolveUserId } from "@/lib/auth";
import { getRun } from "@/lib/runs";
import { subscribeRun } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SSE live feed for a bot run.
 *
 * Access is owner-namespaced. When GitHub auth is configured the signed session
 * must own the run (same check as `/api/runs/[id]`); local single-operator mode
 * keeps the Phase 1–3 behaviour. The stream subscribes to the run's Redis
 * pub/sub channel (written by Inngest/Modal) and relays each event as SSE.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: runId } = await params;

  const resolved = resolveUserId(req, req.nextUrl.searchParams.get("userId")?.trim());
  if (!resolved.ok) {
    return new NextResponse(JSON.stringify({ ok: false, error: resolved.error }), {
      status: resolved.status,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (authRequired()) {
    const run = await getRun(resolved.userId, runId);
    if (!run) {
      return new NextResponse(JSON.stringify({ ok: false, error: "Run not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      const send = (event: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };

      const unsubscribe = subscribeRun(runId, (event) => send(event));

      if (!unsubscribe) {
        send({ type: "ready", runId, note: "Redis not configured — live stream idle." });
        controller.close();
        return;
      }

      send({ type: "ready", runId });

      // Keep the connection alive; clean up on abort.
      const keepalive = setInterval(() => {
        controller.enqueue(encoder.encode(`: ping\n\n`));
      }, 15000);

      req.signal.addEventListener("abort", () => {
        clearInterval(keepalive);
        unsubscribe.then((unsub) => unsub()).catch(() => {});
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
