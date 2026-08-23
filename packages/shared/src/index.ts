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
  seatIds: string[];
  chairId: string;
  schedule?: string;
  createdAt: number;
}

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
