export type View = "chamber" | "ledger" | "dock" | "runs" | "settings";

export type SeatStatus = "idle" | "deliberating" | "done";

export type SessionStatus = "convening" | "sealed" | "failed";

export interface Seat {
  id: string;
  name: string;
  role: string;
  mandate: string;
  initials: string;
  chair: boolean;
  model: string;
  status: SeatStatus;
}

export interface Position {
  seatId: string;
  stance: string;
  body: string;
  dissent: boolean;
}

export interface Session {
  id: string;
  question: string;
  seatIds: string[];
  chairId: string;
  status: SessionStatus;
  positions: Position[];
  verdict: string;
  dissent: string;
  error?: string;
  createdAt: number;
  sealedAt?: number;
}

export interface MemoryItem {
  id: string;
  text: string;
  source: string;
  createdAt: number;
}

export interface DockFile {
  id: string;
  path: string;
  content: string;
  updatedAt: number;
}

export interface ProviderConfig {
  provider: "openai" | "anthropic" | "xai" | "openrouter" | "custom";
  apiKey: string;
  baseUrl: string;
  model: string;
}

export interface AppState {
  hydrated: boolean;
  seenOnboarding: boolean;
  view: View;
  seats: Seat[];
  sittingIds: string[];
  sessions: Session[];
  activeSessionId: string | null;
  memories: MemoryItem[];
  files: DockFile[];
  provider: ProviderConfig;
  convening: boolean;
}
