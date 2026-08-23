import { NextRequest, NextResponse } from "next/server";
import { storeLlmConfig } from "@/lib/llm-key-store";
import type { LlmProvider } from "@quorum/shared";

export const runtime = "nodejs";

type Body = {
  userId: string;
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
 * In Phase 4 a real auth session provides `userId`; for now the UI sends a
 * stable local id. Without auth the operator simply shouldn't expose this
 * route publicly.
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
  if (!body.userId?.trim()) {
    return NextResponse.json({ ok: false, error: "userId required" }, { status: 400 });
  }

  try {
    await storeLlmConfig(body.userId, body.apiKey.trim(), {
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
