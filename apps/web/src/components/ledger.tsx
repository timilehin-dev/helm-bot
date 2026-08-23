"use client";

import { useState } from "react";
import { useQuorum } from "@/lib/store";

export function Ledger() {
  const { memories, addMemory, updateMemory, deleteMemory } = useQuorum();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [editText, setEditText] = useState("");

  return (
    <div className="mx-auto max-w-2xl px-4 py-8 sm:px-8">
      <p className="font-mono text-[11px] tracking-[0.16em] text-muted uppercase">
        Ledger
      </p>
      <h1 className="font-display mt-1 text-3xl tracking-tight">
        Memory you can read
      </h1>
      <p className="mt-2 text-sm text-muted">
        Every durable fact is listed, editable, and deletable. Nothing hides in
        a vendor vault.
      </p>

      <form
        className="mt-6 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!draft.trim()) return;
          addMemory(draft.trim(), "Operator");
          setDraft("");
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="Add a standing fact…"
          className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="submit"
          className="h-10 rounded-md bg-accent px-4 text-sm font-medium text-accent-fg"
        >
          Add
        </button>
      </form>

      <ul className="mt-6 space-y-2">
        {memories.map((m) => (
          <li
            key={m.id}
            className="rounded-lg border border-border bg-surface p-4"
          >
            {editing === m.id ? (
              <div className="space-y-2">
                <textarea
                  value={editText}
                  onChange={(e) => setEditText(e.target.value)}
                  rows={3}
                  className="w-full rounded-md border border-border bg-raised p-2 text-sm outline-none"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateMemory(m.id, editText.trim());
                      setEditing(null);
                    }}
                    className="h-8 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditing(null)}
                    className="h-8 rounded-md px-3 text-xs text-muted hover:text-fg"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm">{m.text}</p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <span className="font-mono text-[10px] text-subtle">
                    {m.source}
                  </span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setEditing(m.id);
                        setEditText(m.text);
                      }}
                      className="text-xs text-muted hover:text-fg"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteMemory(m.id)}
                      className="text-xs text-danger hover:opacity-80"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
