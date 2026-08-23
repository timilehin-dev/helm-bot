import type { Seat } from "@quorum/shared";

/**
 * Modal invocation helper.
 *
 * The Modal agent runs as a Python function behind an HTTPS web endpoint.
 * Inngest calls it with the *decrypted* BYOK key in the request body — the key
 * is never an env var and never persisted. Progress streams back to the Vercel
 * UI via Redis pub/sub (Upstash), which the Modal agent writes directly.
 *
 * `MODAL_AGENT_URL` is an infra env var the operator sets once (`modal deploy`
 * prints it). When unset (local dev), this returns a typed "unconfigured"
 * result so the durable function can record a clear failure instead of throwing.
 */

export interface ModalRunRequest {
  runId: string;
  task: string;
  seats: Seat[];
  chairId: string;
  /** Decrypted provider API key — forwarded over HTTPS, never logged. */
  apiKey: string;
  llm: { provider: string; baseUrl: string; model: string };
  /** Optional infra tokens passed through so the agent can use its own tools. */
  infra?: {
    tavilyApiKey?: string;
    redisUrl?: string;
  };
}

export type ModalRunResponse =
  | {
      ok: true;
      runId?: string;
      verdict?: string;
      dissent?: string;
    }
  | {
      ok: false;
      runId?: string;
      error?: string;
      unconfigured?: boolean;
    };

function endpoint(): string | undefined {
  return process.env.MODAL_AGENT_URL?.trim() || undefined;
}

export async function invokeModalAgent(
  req: ModalRunRequest,
): Promise<ModalRunResponse> {
  const url = endpoint();
  if (!url) {
    return { ok: false, unconfigured: true, error: "MODAL_AGENT_URL not set" };
  }

  try {
    const res = await fetch(`${url.replace(/\/$/, "")}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      // The Modal agent loop can be long-running; give it generous headroom.
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });
    const data = (await res.json()) as ModalRunResponse;
    if (!res.ok) {
      const error = data.ok === false ? data.error : undefined;
      return { ok: false, error: error ?? `Modal ${res.status}` };
    }
    return data;
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Modal invocation failed",
    };
  }
}
