"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  DockFile,
  MemoryItem,
  ProviderConfig,
  Seat,
  Session,
  View,
} from "./types";
import {
  IVO,
  REED,
  KADE,
  SESSION_SEED,
  seedFiles,
  seedMemories,
  seedSeats,
  seedSessions,
} from "./seed";

export function uid(prefix = "id") {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export { IVO };

const defaultProvider: ProviderConfig = {
  provider: "openai",
  apiKey: "",
  baseUrl: "https://api.openai.com/v1",
  model: "gpt-4o",
};

const STORAGE_KEY = "quorum-v1";

type State = {
  seenOnboarding: boolean;
  view: View;
  seats: Seat[];
  sittingIds: string[];
  sessions: Session[];
  activeSessionId: string | null;
  memories: MemoryItem[];
  files: DockFile[];
  provider: ProviderConfig;
};

const defaults: State = {
  seenOnboarding: false,
  view: "chamber",
  seats: seedSeats,
  sittingIds: [REED, KADE],
  sessions: seedSessions,
  activeSessionId: SESSION_SEED,
  memories: seedMemories,
  files: seedFiles,
  provider: defaultProvider,
};

type Store = State & {
  hydrated: boolean;
  convening: boolean;
  setView: (view: View) => void;
  dismissOnboarding: () => void;
  toggleSitting: (id: string) => void;
  setActiveSession: (id: string | null) => void;
  setConvening: (v: boolean) => void;
  addSession: (s: Session) => void;
  patchSession: (id: string, patch: Partial<Session>) => void;
  addMemory: (text: string, source: string) => void;
  updateMemory: (id: string, text: string) => void;
  deleteMemory: (id: string) => void;
  upsertFile: (path: string, content: string) => void;
  deleteFile: (id: string) => void;
  setProvider: (p: Partial<ProviderConfig>) => void;
  setSeatStatus: (id: string, status: Seat["status"]) => void;
  resetDemo: () => void;
};

const Ctx = createContext<Store | null>(null);

function loadState(): State {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...(JSON.parse(raw) as Partial<State>) };
  } catch {
    return defaults;
  }
}

export function QuorumProvider({ children }: { children: ReactNode }) {
  const [hydrated, setHydrated] = useState(false);
  const [state, setState] = useState<State>(defaults);
  const [convening, setConvening] = useState(false);

  useEffect(() => {
    setState(loadState());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  const setView = useCallback((view: View) => {
    setState((s) => ({ ...s, view }));
  }, []);

  const dismissOnboarding = useCallback(() => {
    setState((s) => ({ ...s, seenOnboarding: true }));
  }, []);

  const toggleSitting = useCallback((id: string) => {
    setState((s) => {
      const seat = s.seats.find((x) => x.id === id);
      if (!seat || seat.chair) return s;
      const on = s.sittingIds.includes(id);
      if (on && s.sittingIds.length === 1) return s;
      return {
        ...s,
        sittingIds: on
          ? s.sittingIds.filter((x) => x !== id)
          : [...s.sittingIds, id].slice(0, 3),
      };
    });
  }, []);

  const setActiveSession = useCallback((id: string | null) => {
    setState((s) => ({ ...s, activeSessionId: id, view: "chamber" }));
  }, []);

  const addSession = useCallback((session: Session) => {
    setState((s) => ({
      ...s,
      sessions: [session, ...s.sessions],
      activeSessionId: session.id,
      view: "chamber",
    }));
  }, []);

  const patchSession = useCallback((id: string, patch: Partial<Session>) => {
    setState((s) => ({
      ...s,
      sessions: s.sessions.map((x) => (x.id === id ? { ...x, ...patch } : x)),
    }));
  }, []);

  const addMemory = useCallback((text: string, source: string) => {
    setState((s) => ({
      ...s,
      memories: [
        { id: uid("mem"), text, source, createdAt: Date.now() },
        ...s.memories,
      ],
    }));
  }, []);

  const updateMemory = useCallback((id: string, text: string) => {
    setState((s) => ({
      ...s,
      memories: s.memories.map((m) => (m.id === id ? { ...m, text } : m)),
    }));
  }, []);

  const deleteMemory = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      memories: s.memories.filter((m) => m.id !== id),
    }));
  }, []);

  const upsertFile = useCallback((path: string, content: string) => {
    setState((s) => {
      const existing = s.files.find((f) => f.path === path);
      if (existing) {
        return {
          ...s,
          files: s.files.map((f) =>
            f.id === existing.id
              ? { ...f, content, updatedAt: Date.now() }
              : f,
          ),
        };
      }
      return {
        ...s,
        files: [
          { id: uid("file"), path, content, updatedAt: Date.now() },
          ...s.files,
        ],
      };
    });
  }, []);

  const deleteFile = useCallback((id: string) => {
    setState((s) => ({
      ...s,
      files: s.files.filter((f) => f.id !== id),
    }));
  }, []);

  const setProvider = useCallback((p: Partial<ProviderConfig>) => {
    setState((s) => ({ ...s, provider: { ...s.provider, ...p } }));
  }, []);

  const setSeatStatus = useCallback((id: string, status: Seat["status"]) => {
    setState((s) => ({
      ...s,
      seats: s.seats.map((x) => (x.id === id ? { ...x, status } : x)),
    }));
  }, []);

  const resetDemo = useCallback(() => {
    setState({ ...defaults, seenOnboarding: true });
  }, []);

  const value = useMemo<Store>(
    () => ({
      ...state,
      hydrated,
      convening,
      setView,
      dismissOnboarding,
      toggleSitting,
      setActiveSession,
      setConvening,
      addSession,
      patchSession,
      addMemory,
      updateMemory,
      deleteMemory,
      upsertFile,
      deleteFile,
      setProvider,
      setSeatStatus,
      resetDemo,
    }),
    [
      state,
      hydrated,
      convening,
      setView,
      dismissOnboarding,
      toggleSitting,
      setActiveSession,
      addSession,
      patchSession,
      addMemory,
      updateMemory,
      deleteMemory,
      upsertFile,
      deleteFile,
      setProvider,
      setSeatStatus,
      resetDemo,
    ],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useQuorum(): Store {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useQuorum must be used within QuorumProvider");
  return ctx;
}
