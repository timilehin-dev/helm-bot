import { NextRequest } from "next/server";
import { subscribeRun } from "@/lib/redis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * SSE live feed for a bot run.
 *
 * Subscribes to the run's Redis pub/sub channel (written by Inngest/Modal) and
 * relays each event to the browser as a Server-Sent Event. When Redis isn't
 * configured locally, we send a single ready sentinel and close so the client
 * doesn't hang.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: runId } = await params;

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

      _req.signal.addEventListener("abort", () => {
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
