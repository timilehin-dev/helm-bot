import type { LlmProvider } from "@quorum/shared";

/**
 * Client-side BYOK status (Phase 4).
 *
 * The LLM key is the only secret a user supplies. It is encrypted and stored
 * in Redis server-side (POST /api/llm-key); the chat route prefers that stored
 * key over the legacy Phase-1 localStorage key. These helpers mirror the
 * server-side status endpoint so the UI can gate on whether a key is actually
 * persisted for the signed-in owner.
 */

export interface LlmStatus {
  /** True when Redis is configured, so a server-side key could be stored. */
  configured: boolean;
  /** True when an encrypted key is currently stored for the owner. */
  stored: boolean;
  meta: { provider: string; model: string } | null;
}

export interface SaveLlmKeyInput {
  apiKey: string;
  provider: LlmProvider;
  baseUrl: string;
  model: string;
}

/** Read the current BYOK status for an owner id. */
export async function getLlmStatus(userId: string): Promise<LlmStatus | null> {
  try {
    const res = await fetch(
      `/api/llm-key?userId=${encodeURIComponent(userId)}`,
      { cache: "no-store" },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as LlmStatus & { ok: boolean };
    return data.ok === false ? null : data;
  } catch {
    return null;
  }
}

/** Persist the key server-side (encrypted in Redis). Returns null on failure. */
export async function saveLlmKey(
  userId: string,
  input: SaveLlmKeyInput,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch("/api/llm-key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId, ...input }),
    });
    const data = (await res.json()) as { ok: boolean; error?: string };
    return { ok: Boolean(data.ok), error: data.error };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Failed to save key" };
  }
}
