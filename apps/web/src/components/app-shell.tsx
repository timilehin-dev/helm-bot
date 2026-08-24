"use client";

import { QuorumProvider, useQuorum } from "@/lib/store";
import type { View } from "@/lib/types";
import { Chamber } from "./chamber";
import { Dock } from "./dock";
import { Ledger } from "./ledger";
import { Onboarding } from "./onboarding";
import { Runs } from "./runs";
import { Settings } from "./settings";

const nav: Array<{ id: View; label: string }> = [
  { id: "chamber", label: "Chamber" },
  { id: "runs", label: "Runs" },
  { id: "ledger", label: "Ledger" },
  { id: "dock", label: "Dock" },
  { id: "settings", label: "Settings" },
];

function Wordmark() {
  return (
    <div className="flex items-center gap-2.5">
      <span className="inline-flex size-8 items-center justify-center rounded-md bg-raised ring-1 ring-border">
        <svg viewBox="0 0 24 24" className="size-4 text-fg" aria-hidden>
          <circle
            cx="12"
            cy="12"
            r="8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.3"
          />
          <circle cx="12" cy="7.5" r="1.4" fill="currentColor" />
          <circle cx="8.2" cy="14.2" r="1.4" fill="currentColor" />
          <circle cx="15.8" cy="14.2" r="1.4" fill="currentColor" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className="font-display text-lg tracking-tight">Quorum</span>
        <span className="mt-0 block font-mono text-[10px] tracking-[0.14em] text-muted uppercase">
          The chamber
        </span>
      </span>
    </div>
  );
}

function ShellInner() {
  const { hydrated, seenOnboarding, view, setView, seats, provider } =
    useQuorum();

  if (!hydrated) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg">
        <p className="font-display text-2xl tracking-tight text-fg">Quorum</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh bg-bg text-fg">
      {!seenOnboarding && <Onboarding />}

      <aside className="hidden w-56 shrink-0 flex-col border-r border-border lg:flex">
        <div className="px-4 py-4">
          <button type="button" onClick={() => setView("chamber")}>
            <Wordmark />
          </button>
        </div>
        <nav className="px-2">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`flex h-10 w-full items-center rounded-md px-3 text-sm ${
                view === item.id
                  ? "bg-raised text-fg"
                  : "text-muted hover:bg-raised/60 hover:text-fg"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="mt-6 px-4">
          <p className="font-mono text-[11px] tracking-[0.14em] text-subtle uppercase">
            Seats
          </p>
          <ul className="mt-2 space-y-1">
            {seats.map((s) => (
              <li key={s.id} className="flex items-center gap-2 px-1 py-1.5">
                <span className="inline-flex size-7 items-center justify-center rounded-md bg-raised font-mono text-[10px] ring-1 ring-border">
                  {s.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm">{s.name}</span>
                  <span className="block truncate text-[11px] text-muted">
                    {s.role}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-auto border-t border-border p-4">
          <p className="font-mono text-[10px] text-subtle">
            {provider.apiKey
              ? `${provider.provider} · ${provider.model}`
              : "No API key"}
          </p>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border px-3 py-2 lg:hidden">
          <button type="button" onClick={() => setView("chamber")}>
            <Wordmark />
          </button>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {view === "chamber" && <Chamber />}
          {view === "runs" && <Runs />}
          {view === "ledger" && <Ledger />}
          {view === "dock" && <Dock />}
          {view === "settings" && <Settings />}
        </main>

        <nav className="grid grid-cols-5 border-t border-border lg:hidden">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setView(item.id)}
              className={`flex h-14 flex-col items-center justify-center text-[10px] ${
                view === item.id ? "text-fg" : "text-muted"
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
    </div>
  );
}

export function AppShell() {
  return (
    <QuorumProvider>
      <ShellInner />
    </QuorumProvider>
  );
}
