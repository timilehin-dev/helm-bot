import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { storeLlmConfig } from "@/lib/llm-key-store";
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
