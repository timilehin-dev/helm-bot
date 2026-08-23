"use client";

import { useState } from "react";
import { useQuorum } from "@/lib/store";

export function Dock() {
  const { files, deleteFile } = useQuorum();
  const [selected, setSelected] = useState<string | null>(
    files[0]?.id ?? null,
  );
  const active = files.find((f) => f.id === selected) ?? files[0];

  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <aside className="shrink-0 border-b border-border lg:w-64 lg:border-r lg:border-b-0">
        <div className="px-4 py-4">
          <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
            Dock
          </p>
          <h1 className="font-display mt-1 text-xl tracking-tight">
            Workspace files
          </h1>
        </div>
        <ul className="px-2 pb-4">
          {files.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                onClick={() => setSelected(f.id)}
                className={`flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm ${
                  active?.id === f.id
                    ? "bg-raised text-fg"
                    : "text-muted hover:bg-raised/50 hover:text-fg"
                }`}
              >
                <span className="truncate font-mono text-xs">{f.path}</span>
              </button>
            </li>
          ))}
          {files.length === 0 && (
            <li className="px-3 py-2 text-sm text-muted">No files yet.</li>
          )}
        </ul>
      </aside>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        {active ? (
          <>
            <div className="flex items-center justify-between gap-3">
              <h2 className="font-mono text-sm text-fg">{active.path}</h2>
              <button
                type="button"
                onClick={() => {
                  deleteFile(active.id);
                  setSelected(null);
                }}
                className="text-xs text-danger"
              >
                Delete
              </button>
            </div>
            <pre className="mt-4 whitespace-pre-wrap rounded-lg border border-border bg-surface p-4 font-mono text-xs leading-relaxed text-fg/90">
              {active.content}
            </pre>
          </>
        ) : (
          <p className="text-sm text-muted">Select a file.</p>
        )}
      </div>
    </div>
  );
}
