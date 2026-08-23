/**
 * Tavily search + extract tool.
 *
 * Tavily is the web-evidence layer for the council. Its API key is an
 * *infrastructure* secret (operator-provided env var `TAVILY_API_KEY`), not a
 * user BYOK key — it never touches the encrypted LLM-key store.
 *
 * This module is safe to call from API routes and Inngest step functions.
 * When `TAVILY_API_KEY` is unset it degrades to a typed "unconfigured" result
 * so the app still builds/runs in dev without a key.
 */

export interface TavilyResult {
  title: string;
  url: string;
  content: string;
  score: number;
}

export interface TavilySearchResponse {
  ok: boolean;
  query: string;
  results: TavilyResult[];
  /** Present when the tool isn't configured; callers can surface this. */
  unconfigured?: boolean;
  error?: string;
}

export interface TavilyExtractResponse {
  ok: boolean;
  urls: string[];
  results: Array<{ url: string; raw_content: string }>;
  unconfigured?: boolean;
  error?: string;
}

const TAVILY_ENDPOINT = "https://api.tavily.com";

function apiKey(): string | undefined {
  return process.env.TAVILY_API_KEY?.trim() || undefined;
}

export async function tavilySearch(
  query: string,
  opts: { maxResults?: number } = {},
): Promise<TavilySearchResponse> {
  const key = apiKey();
  if (!key) {
    return { ok: false, query, results: [], unconfigured: true };
  }
  if (!query.trim()) {
    return { ok: false, query, results: [], error: "Empty query" };
  }

  try {
    const res = await fetch(`${TAVILY_ENDPOINT}/search`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: key,
        query,
        max_results: opts.maxResults ?? 5,
        include_answer: false,
      }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return {
        ok: false,
        query,
        results: [],
        error: `Tavily ${res.status}: ${err.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string; score?: number }>;
    };
    const results: TavilyResult[] = (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        title: r.title ?? "",
        url: r.url as string,
        content: r.content ?? "",
        score: r.score ?? 0,
      }));
    return { ok: true, query, results };
  } catch (err) {
    return {
      ok: false,
      query,
      results: [],
      error: err instanceof Error ? err.message : "Tavily request failed",
    };
  }
}

export async function tavilyExtract(urls: string[]): Promise<TavilyExtractResponse> {
  const key = apiKey();
  if (!key) {
    return { ok: false, urls, results: [], unconfigured: true };
  }
  const clean = urls.map((u) => u.trim()).filter(Boolean);
  if (clean.length === 0) {
    return { ok: false, urls, results: [], error: "No URLs" };
  }

  try {
    const res = await fetch(`${TAVILY_ENDPOINT}/extract`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: key, urls: clean }),
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return {
        ok: false,
        urls,
        results: [],
        error: `Tavily ${res.status}: ${err.slice(0, 200)}`,
      };
    }
    const data = (await res.json()) as {
      results?: Array<{ url?: string; raw_content?: string }>;
    };
    const results = (data.results ?? [])
      .filter((r) => r.url)
      .map((r) => ({
        url: r.url as string,
        raw_content: r.raw_content ?? "",
      }));
    return { ok: true, urls, results };
  } catch (err) {
    return {
      ok: false,
      urls,
      results: [],
      error: err instanceof Error ? err.message : "Tavily extract failed",
    };
  }
}
