import type { Position, ProviderConfig, Seat } from "./types";

export interface ConveneRequest {
  question: string;
  seats: Array<Pick<Seat, "id" | "name" | "role" | "mandate" | "chair">>;
  chairId: string;
  seatIds: string[];
  memories: string[];
  provider: ProviderConfig;
}

export interface ConveneOk {
  ok: true;
  positions: Position[];
  verdict: string;
  dissent: string;
  verdictFile?: { path: string; content: string };
}

export interface ConveneErr {
  ok: false;
  error: string;
}

export type ConveneResponse = ConveneOk | ConveneErr;

async function chat(
  provider: ProviderConfig,
  system: string,
  user: string,
): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: provider.provider,
      apiKey: provider.apiKey,
      baseUrl: provider.baseUrl,
      model: provider.model,
      system,
      user,
    }),
  });
  const data = (await res.json()) as { ok: boolean; text?: string; error?: string };
  if (!data.ok || !data.text) {
    throw new Error(data.error || "Model call failed");
  }
  return data.text;
}

function parseJsonBlock(raw: string): Record<string, unknown> | null {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

async function runSpecialist(
  provider: ProviderConfig,
  seat: ConveneRequest["seats"][number],
  question: string,
  memories: string[],
): Promise<Position> {
  const system = `You are ${seat.name}, the ${seat.role} seat in Quorum — a self-hosted AI council.
Mandate: ${seat.mandate}

Rules:
- Answer independently. Do not try to agree with anyone.
- If you reject the obvious majority reading, mark dissent true.
- Be concise and specific. No hype. No filler.
- Return ONLY valid JSON with keys: stance (one sentence), body (2-5 short paragraphs or bullets), dissent (boolean).`;

  const user = `Question for the chamber:
${question}

Ledger (operator memory):
${memories.length ? memories.map((m) => `- ${m}`).join("\n") : "(empty)"}

Cast your independent position as JSON.`;

  const raw = await chat(provider, system, user);
  const parsed = parseJsonBlock(raw);
  if (parsed) {
    return {
      seatId: seat.id,
      stance: String(parsed.stance ?? "").trim() || "Position filed.",
      body: String(parsed.body ?? raw).trim(),
      dissent: Boolean(parsed.dissent),
    };
  }
  return {
    seatId: seat.id,
    stance: "Position filed.",
    body: raw.trim(),
    dissent: false,
  };
}

async function runChair(
  provider: ProviderConfig,
  chair: ConveneRequest["seats"][number],
  question: string,
  positions: Position[],
  seats: ConveneRequest["seats"],
): Promise<{ verdict: string; dissent: string; file?: { path: string; content: string } }> {
  const lines = positions
    .map((p) => {
      const s = seats.find((x) => x.id === p.seatId);
      return `### ${s?.name ?? p.seatId} (${s?.role ?? "seat"})${p.dissent ? " · DISSENT" : ""}
Stance: ${p.stance}
${p.body}`;
    })
    .join("\n\n");

  const system = `You are ${chair.name}, Chair of Quorum.
Mandate: ${chair.mandate}

Rules:
- Seal a clear decision. Name owners if relevant.
- Record dissent honestly. Never erase minority reports.
- Prefer a short verdict over a long summary.
- Return ONLY valid JSON with keys: verdict (string), dissent (string; use "None recorded." if none), path (string starting with /verdicts/), content (markdown file body).`;

  const user = `Question:
${question}

Positions heard:
${lines}

Seal the session as JSON.`;

  const raw = await chat(provider, system, user);
  const parsed = parseJsonBlock(raw);
  if (parsed) {
    const path = String(parsed.path ?? "/verdicts/session.md");
    const content = String(parsed.content ?? parsed.verdict ?? raw);
    return {
      verdict: String(parsed.verdict ?? "").trim() || raw.trim(),
      dissent: String(parsed.dissent ?? "None recorded.").trim(),
      file: { path, content },
    };
  }
  return {
    verdict: raw.trim(),
    dissent: "None recorded.",
  };
}

/** Client-side convene: specialists in parallel, then chair. */
export async function convene(req: ConveneRequest): Promise<ConveneResponse> {
  if (!req.provider.apiKey.trim()) {
    return {
      ok: false,
      error: "Add a cloud API key in Settings. Quorum uses your keys — nothing is hosted for you.",
    };
  }

  const specialists = req.seatIds
    .map((id) => req.seats.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => Boolean(s) && !s.chair)
    .slice(0, 3);

  const chair = req.seats.find((s) => s.id === req.chairId);
  if (!chair || specialists.length === 0) {
    return { ok: false, error: "Need a chair and at least one specialist seat." };
  }

  try {
    const positions = await Promise.all(
      specialists.map((seat) =>
        runSpecialist(req.provider, seat, req.question, req.memories),
      ),
    );

    const sealed = await runChair(
      req.provider,
      chair,
      req.question,
      positions,
      req.seats,
    );

    return {
      ok: true,
      positions,
      verdict: sealed.verdict,
      dissent: sealed.dissent,
      verdictFile: sealed.file,
    };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Convene failed",
    };
  }
}
