import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { getEncryptedKey, storeLlmConfig } from "@/lib/llm-key-store";
import { llmKeyRefFor, redisConfigured, getProviderMeta } from "@/lib/redis";
import type { LlmProvider } from "@quorum/shared";

export const runtime = "nodejs";

type Body = {
  /** Local-mode fallback only; ignored when a session is present. */
  userId?: string;
  apiKey: string;
  provider: LlmProvider;
  baseUrl: string;
  model: string;
};

/**
 * `GET /api/llm-key` — whether a server-side BYOK key is stored for the owner.
 *
 * `configured` is true only when Redis is available (so an encrypted payload
 * could actually be read back). `stored` is true when such a key exists now.
 * Non-secret provider metadata (provider/model) rides along for the UI.
 */
export async function GET(req: NextRequest) {
  const resolved = resolveUserId(req, req.nextUrl.searchParams.get("userId")?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }

  const configured = redisConfigured();
  let stored = false;
  let meta: { provider: string; model: string } | null = null;
  if (configured) {
    try {
      stored = (await getEncryptedKey(llmKeyRefFor(resolved.userId))) !== null;
    } catch {
      // Treat an unreachable Redis as "not stored": the client must not trust it.
    }
    try {
      const m = await getProviderMeta(resolved.userId);
      meta = m ? { provider: m.provider, model: m.model } : null;
    } catch {
      /* keep meta null */
    }
  }
  return NextResponse.json({ ok: true, configured, stored, meta });
}

/**
 * Save a user's BYOK LLM key.
 *
 * The key is encrypted with the deployment's ENCRYPTION_KEY before being stored
 * in Redis. The plain value never touches the database. Non-secret provider
 * metadata (provider/baseUrl/model) is stored alongside for retrieval.
 *
 * The owner is sourced from the signed session (Phase 4); the body `userId` is
 * only a single-operator local-mode fallback when GitHub auth is unset.
 */
export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.apiKey?.trim()) {
    return NextResponse.json({ ok: false, error: "API key required" }, { status: 400 });
  }

  const resolved = resolveUserId(req, body.userId?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }

  try {
    await storeLlmConfig(resolved.userId, body.apiKey.trim(), {
      provider: body.provider,
      baseUrl: body.baseUrl,
      model: body.model,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Failed to store key" },
      { status: 500 },
    );
  }
}
