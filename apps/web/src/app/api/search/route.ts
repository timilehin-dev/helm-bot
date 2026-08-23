import { NextRequest, NextResponse } from "next/server";
import { tavilySearch, tavilyExtract } from "@/lib/tavily";

/**
 * Web evidence endpoint for the council.
 *
 * GET  /api/search?q=...      → Tavily search
 * POST /api/search { urls }   → Tavily extract (raw page content)
 *
 * Uses the operator's `TAVILY_API_KEY` (infra secret), not a user LLM key.
 * Returns a typed "unconfigured" payload when the key is absent so the UI can
 * show a friendly state instead of erroring.
 */
export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const max = Number(req.nextUrl.searchParams.get("max") ?? "5");
  const res = await tavilySearch(q, {
    maxResults: Number.isFinite(max) && max > 0 ? Math.min(max, 10) : 5,
  });
  return NextResponse.json(res, { status: res.ok ? 200 : res.unconfigured ? 200 : 502 });
}

export async function POST(req: NextRequest) {
  let body: { urls?: string[] };
  try {
    body = (await req.json()) as { urls?: string[] };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  const urls = Array.isArray(body.urls) ? body.urls : [];
  const res = await tavilyExtract(urls);
  return NextResponse.json(res, { status: res.ok ? 200 : res.unconfigured ? 200 : 502 });
}
