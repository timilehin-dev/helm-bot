import { NextRequest, NextResponse } from "next/server";
import { resolveUserId } from "@/lib/auth";
import { getDecryptedKey } from "@/lib/llm-key-store";
import { getProviderMeta, llmKeyRefFor } from "@/lib/redis";
import type { LlmConfig, LlmProvider } from "@quorum/shared";

type Body = {
  /** Local-mode fallback only; ignored when a session is present. */
  userId?: string;
  provider: LlmProvider;
  /** Legacy Phase-1 localStorage key. Used only when no server-side key is stored. */
  apiKey?: string;
  baseUrl?: string;
  model?: string;
  system: string;
  user: string;
};

const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  xai: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

/**
 * Resolve the effective LLM key + provider config for a conversation call.
 *
 * Session-scoped (Phase 4): prefer the owner's server-side encrypted BYOK key
 * (saved via POST /api/llm-key) and its non-secret provider metadata. Fall back
 * to the legacy Phase-1 body key/config only for single-operator local mode
 * before any key has been persisted server-side.
 */
async function resolveLlmKey(
  userId: string,
  body: Body,
): Promise<{ apiKey: string; resolvedCfg: LlmConfig }> {
  let stored: string | null = null;
  try {
    stored = await getDecryptedKey(llmKeyRefFor(userId));
  } catch {
    // ENCRYPTION_KEY / Redis unset in local dev → fall back to the body key.
  }

  let meta: LlmConfig | null = null;
  try {
    meta = await getProviderMeta(userId);
  } catch {
    // Redis unset → fall back to the body config.
  }

  return {
    apiKey: stored?.trim() || body.apiKey?.trim() || "",
    resolvedCfg: {
      provider: (meta?.provider ?? body.provider) as LlmProvider,
      baseUrl: meta?.baseUrl ?? "",
      model: meta?.model ?? "",
    },
  };
}

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const resolved = resolveUserId(req, body.userId?.trim());
  if (!resolved.ok) {
    return NextResponse.json({ ok: false, error: resolved.error }, { status: resolved.status });
  }

  const { apiKey, resolvedCfg } = await resolveLlmKey(resolved.userId, body);

  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "No LLM key stored for this user. Add one in Settings." },
      { status: 400 },
    );
  }

  const provider = resolvedCfg.provider || body.provider;
  const base =
    resolvedCfg.baseUrl?.trim() ||
    body.baseUrl?.trim() ||
    PROVIDER_DEFAULTS[provider] ||
    "https://api.openai.com/v1";
  const model =
    resolvedCfg.model?.trim() || body.model?.trim() || "gpt-4o";

  try {
    if (provider === "anthropic") {
      const res = await fetch(`${base.replace(/\/$/, "")}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1200,
          system: body.system,
          messages: [{ role: "user", content: body.user }],
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "");
        return NextResponse.json(
          {
            ok: false,
            error: `Anthropic ${res.status}: ${err.slice(0, 200)}`,
          },
          { status: 502 },
        );
      }
      const data = (await res.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text =
        data.content?.filter((c) => c.type === "text").map((c) => c.text).join("") ??
        "";
      return NextResponse.json({ ok: true, text });
    }

    const res = await fetch(`${base.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        max_tokens: 1200,
        temperature: 0.4,
        messages: [
          { role: "system", content: body.system },
          { role: "user", content: body.user },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return NextResponse.json(
        { ok: false, error: `API ${res.status}: ${err.slice(0, 200)}` },
        { status: 502 },
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = data.choices?.[0]?.message?.content ?? "";
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Upstream failed",
      },
      { status: 502 },
    );
  }
}
