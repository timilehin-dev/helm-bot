/**
 * Quorum v2 shared domain types.
 *
 * Used across the Vercel (Next.js) app, Inngest durable functions, and the
 * Modal Python agent (via JSON on the wire). Keep these dependency-free.
 */

/** The acting seats. In v2 each seat is a worker, not just an opinion. */
export type SeatRole = "chair" | "developer" | "researcher" | "ops" | "adversary";

export interface Seat {
  id: string;
  name: string;
  role: SeatRole;
  mandate: string;
  initials: string;
  chair: boolean;
}

/**
 * The canonical v2 acting seats. Each is a *worker* with a concrete toolset
 * (see ARCHITECTURE.md), not merely an opinion. They are the source of truth
 * shared by the Vercel UI, Inngest, and the Modal Python agent (via JSON).
 */
export const SEATS: Seat[] = [
  {
    id: "seat_chair",
    name: "Ivo",
    role: "chair",
    mandate:
      "Plan the job, delegate to the acting seats, then seal a verdict that names the decision, the owners, and any dissent. Never flatten disagreement.",
    initials: "IV",
    chair: true,
  },
  {
    id: "seat_developer",
    name: "Reed",
    role: "developer",
    mandate:
      "Write and run code in the sandbox to test hypotheses and produce artifacts. Prefer verifiable output over prose.",
    initials: "RD",
    chair: false,
  },
  {
    id: "seat_researcher",
    name: "Vale",
    role: "researcher",
    mandate:
      "Gather web evidence (search + page extraction) and cite it. Prefer facts and URLs others can re-check.",
    initials: "VA",
    chair: false,
  },
  {
    id: "seat_ops",
    name: "Sage",
    role: "ops",
    mandate:
      "Handle the concrete job: filesystem work, environment checks, and execution logistics. Keep the run moving.",
    initials: "SG",
    chair: false,
  },
  {
    id: "seat_adversary",
    name: "Kade",
    role: "adversary",
    mandate:
      "Attack the majority reading. Find the hidden cost, the missing user, the vendor lock. If the room agrees too fast, you are failing.",
    initials: "KD",
    chair: false,
  },
];

export type RunStatus =
  | "queued"
  | "running"
  | "awaiting_input"
  | "sealed"
  | "failed";

export type StepKind =
  | "plan"
  | "search"
  | "browse"
  | "shell"
  | "fs"
  | "llm"
  | "synthesize"
  | "dissent";

export interface AgentStep {
  id: string;
  seatId: string;
  kind: StepKind;
  title: string;
  detail?: string;
  status: "pending" | "running" | "done" | "error";
  at: number;
  /** Optional structured evidence/artifact produced by the step. */
  artifact?: { kind: string; content: string };
}

export interface RunPosition {
  seatId: string;
  stance: string;
  body: string;
  dissent: boolean;
}

export interface BotRun {
  id: string;
  botId: string;
  task: string;
  seatIds: string[];
  chairId: string;
  status: RunStatus;
  steps: AgentStep[];
  positions: RunPosition[];
  verdict: string;
  dissent: string;
  error?: string;
  createdAt: number;
  sealedAt?: number;
}

export interface Bot {
  id: string;
  name: string;
  /** Acting seats for this bot (chair + workers). Empty = canonical default. */
  seatIds: string[];
  chairId: string;
  /** Cron expression for always-on/scheduled runs (Phase 3). */
  schedule?: string;
  /** The owning user. Bots are namespaced per user so keys resolve correctly. */
  ownerId: string;
  createdAt: number;
}

/** A bot definition as supplied by the operator (no id/createdAt). */
export type BotDraft = Omit<Bot, "id" | "createdAt">;

/** BYOK provider config. The key is encrypted at rest in Redis; the plain
 *  value only ever lives in Inngest step context, never in the DB/UI. */
export type LlmProvider =
  | "openai"
  | "anthropic"
  | "xai"
  | "openrouter"
  | "custom";

export interface LlmConfig {
  provider: LlmProvider;
  baseUrl: string;
  model: string;
}

/** Events published to Redis pub/sub and relayed over SSE to the UI. */
export type RunEvent =
  | { type: "run:queued"; runId: string; botId: string; at: number }
  | { type: "run:started"; runId: string; at: number }
  | { type: "step:started"; runId: string; step: AgentStep }
  | { type: "step:done"; runId: string; step: AgentStep }
  | { type: "step:error"; runId: string; step: AgentStep }
  | { type: "position"; runId: string; position: RunPosition }
  | { type: "run:sealed"; runId: string; verdict: string; dissent: string; at: number }
  | { type: "run:failed"; runId: string; error: string; at: number };

export interface EncryptedPayload {
  /** base64 of the ciphertext */
  ct: string;
  /** base64 of the 12-byte nonce */
  iv: string;
}
