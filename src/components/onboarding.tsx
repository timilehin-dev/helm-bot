"use client";

import { useQuorum } from "@/lib/store";

const beats = [
  {
    k: "01",
    t: "Not a chat window",
    b: "Grok Bot is a messaging app with bots on a vendor computer. Quorum is a chamber: you pose a question, specialists answer at once.",
  },
  {
    k: "02",
    t: "Dissent is first-class",
    b: "The Adversary seat attacks the majority. Minority reports are sealed into the verdict — not smoothed away.",
  },
  {
    k: "03",
    t: "Cloud models, your ledger",
    b: "Thinking runs on OpenAI, Anthropic, xAI, or OpenRouter via your keys. Memory, files, and the audit trail stay on this host.",
  },
];

export function Onboarding() {
  const { dismissOnboarding } = useQuorum();
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/85 p-4 sm:items-center">
      <div className="w-full max-w-lg rounded-xl border border-border bg-surface p-6 sm:p-8">
        <p className="font-mono text-[11px] tracking-[0.18em] text-muted uppercase">
          Welcome
        </p>
        <h1 className="font-display mt-2 text-3xl tracking-tight">Quorum</h1>
        <p className="mt-2 text-sm text-muted">
          A self-hosted alternative to Grok Bot — built as a council, not a chat
          clone.
        </p>
        <ol className="mt-6 space-y-4">
          {beats.map((b) => (
            <li key={b.k} className="flex gap-4">
              <span className="font-mono text-[11px] text-subtle">{b.k}</span>
              <div>
                <p className="text-sm font-medium">{b.t}</p>
                <p className="mt-1 text-sm text-muted">{b.b}</p>
              </div>
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={dismissOnboarding}
          className="mt-8 h-11 w-full rounded-md bg-accent text-sm font-medium text-accent-fg hover:opacity-90"
        >
          Open the chamber
        </button>
      </div>
    </div>
  );
}
