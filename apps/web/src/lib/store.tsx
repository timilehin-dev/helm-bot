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
import { getLlmStatus } from "./llm-status";

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
  /**
   * Phase 4 BYOK: true when the owner has an encrypted key stored server-side
   * (reads from GET /api/llm-key). Only meaningful when `keyStoreReady`.
   */
  keyConfigured: boolean;
  /** True when Redis is available, so a server-side key could be stored. */
  keyStoreReady: boolean;
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
  keyConfigured: false,
  keyStoreReady: false,
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
  /**
   * Phase 4 BYOK: mark the owner's server-side key as stored (or not). A
   * successful save implies Redis is configured, so this also flips
   * `keyStoreReady` true and syncs `provider.model` from the stored metadata.
   */
  setKeyStatus: (stored: boolean, meta?: { provider: string; model: string } | null) => void;
  /** Re-fetch the owner's BYOK status from GET /api/llm-key. */
  refreshKeyStatus: (userId: string) => Promise<void>;
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

  const setKeyStatus = useCallback(
    (stored: boolean, meta?: { provider: string; model: string } | null) => {
      setState((s) => ({
        ...s,
        keyStoreReady: true,
        keyConfigured: stored,
        provider: {
          ...s.provider,
          model: meta?.model ?? s.provider.model,
        },
      }));
    },
    [],
  );

  const refreshKeyStatus = useCallback(async (userId: string) => {
    const status = await getLlmStatus(userId);
    if (!status) return;
    setState((s) => ({
      ...s,
      keyStoreReady: status.configured,
      keyConfigured: status.stored,
      provider: {
        ...s.provider,
        model: status.meta?.model ?? s.provider.model,
      },
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
      setKeyStatus,
      refreshKeyStatus,
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
      setKeyStatus,
      refreshKeyStatus,
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
