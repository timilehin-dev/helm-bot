import { serve } from "inngest/next";
import { functions } from "@/inngest/functions";
import { inngest } from "@/inngest/client";

/**
 * Inngest serve endpoint — the durable orchestration entrypoint.
 *
 * Vercel hosts this route; Inngest calls it to execute registered functions
 * (bot runs, scheduled routines). Configure this URL in your Inngest dashboard.
 */
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions,
  // Vercel streaming/functions need a larger step size budget.
  streaming: "allow",
});
