import { NextRequest, NextResponse } from "next/server";

type Body = {
  provider: "openai" | "anthropic" | "xai" | "openrouter" | "custom";
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: string;
};

const PROVIDER_DEFAULTS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  xai: "https://api.x.ai/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

export async function POST(req: NextRequest) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body.apiKey?.trim()) {
    return NextResponse.json(
      { ok: false, error: "API key required" },
      { status: 400 },
    );
  }

  const base =
    body.baseUrl?.trim() ||
    PROVIDER_DEFAULTS[body.provider] ||
    "https://api.openai.com/v1";
  const model = body.model?.trim() || "gpt-4o";

  try {
    if (body.provider === "anthropic") {
      const res = await fetch(`${base.replace(/\/$/, "")}/messages`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": body.apiKey,
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
        Authorization: `Bearer ${body.apiKey}`,
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
