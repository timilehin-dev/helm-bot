"use client";

import { useQuorum } from "@/lib/store";
import type { ProviderConfig } from "@/lib/types";

const PRESETS: Array<{
  id: ProviderConfig["provider"];
  label: string;
  baseUrl: string;
  model: string;
}> = [
  {
    id: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    model: "claude-sonnet-4-20250514",
  },
  {
    id: "xai",
    label: "xAI (Grok)",
    baseUrl: "https://api.x.ai/v1",
    model: "grok-4.5",
  },
  {
    id: "openrouter",
    label: "OpenRouter",
    baseUrl: "https://openrouter.ai/api/v1",
    model: "openai/gpt-4o",
  },
  {
    id: "custom",
    label: "Custom OpenAI-compatible",
    baseUrl: "",
    model: "gpt-4o",
  },
];

export function Settings() {
  const { provider, setProvider, resetDemo, seats } = useQuorum();

  return (
    <div className="mx-auto max-w-xl px-4 py-8 sm:px-8">
      <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
        Settings
      </p>
      <h1 className="font-display mt-1 text-3xl tracking-tight">
        Cloud models only
      </h1>
      <p className="mt-2 text-sm text-muted">
        Quorum is self-hosted. You bring API keys for cloud providers — no local
        Ollama, no vendor VM holding your logins.
      </p>

      <div className="mt-8 space-y-5">
        <div>
          <label className="text-xs font-medium text-muted">Provider</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() =>
                  setProvider({
                    provider: p.id,
                    baseUrl: p.baseUrl || provider.baseUrl,
                    model: p.model,
                  })
                }
                className={`rounded-full px-3 py-1.5 text-xs font-medium ${
                  provider.provider === p.id
                    ? "bg-accent text-accent-fg"
                    : "bg-raised text-muted hover:text-fg"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-muted">API key</label>
          <input
            type="password"
            value={provider.apiKey}
            onChange={(e) => setProvider({ apiKey: e.target.value })}
            placeholder="sk-…"
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
          />
          <p className="mt-1.5 text-xs text-subtle">
            Stored in this browser only (localStorage). Sent only to the
            provider you choose, via this app&apos;s server route.
          </p>
        </div>

        <div>
          <label className="text-xs font-medium text-muted">Model</label>
          <input
            value={provider.model}
            onChange={(e) => setProvider({ model: e.target.value })}
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <div>
          <label className="text-xs font-medium text-muted">Base URL</label>
          <input
            value={provider.baseUrl}
            onChange={(e) => setProvider({ baseUrl: e.target.value })}
            placeholder="https://api.openai.com/v1"
            className="mt-1.5 h-10 w-full rounded-md border border-border bg-surface px-3 font-mono text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      </div>

      <section className="mt-10">
        <p className="font-mono text-[11px] tracking-[0.14em] text-muted uppercase">
          Standing seats
        </p>
        <ul className="mt-3 space-y-2">
          {seats.map((s) => (
            <li
              key={s.id}
              className="rounded-lg border border-border bg-surface p-3"
            >
              <p className="text-sm font-medium">
                {s.name}
                <span className="ml-2 text-xs font-normal text-muted">
                  {s.role}
                  {s.chair ? " · Chair" : ""}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">{s.mandate}</p>
            </li>
          ))}
        </ul>
      </section>

      <button
        type="button"
        onClick={resetDemo}
        className="mt-8 h-10 rounded-md border border-border px-4 text-sm text-muted hover:text-fg"
      >
        Reset demo data
      </button>
    </div>
  );
}
