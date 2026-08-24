import type { BotRun } from "@quorum/shared";
import {
  getRunState,
  listRunIds,
  putRunState,
  setRunState,
} from "./redis";

/**
 * Run domain module.
 *
 * A run is a *persistent record* of a bot doing a task. It is namespaced by
 * owner and stored in Redis (see `@/lib/redis`). This complements the live SSE
 * feed: the stream shows activity as it happens, the registry lets the UI (and
 * the Phase-3 cron) list past/current runs and read their final state.
 */

/** Create a run record in the "queued" state and index it for the owner. */
export async function createRun(run: BotRun): Promise<void> {
  await putRunState(run.ownerId, run.id, run.createdAt, run);
}

/** Patch a run's fields (idempotent) and persist. */
export async function patchRun(
  ownerId: string,
  runId: string,
  patch: Partial<BotRun>,
): Promise<BotRun | null> {
  const existing = await getRunState<BotRun>(runId);
  if (!existing) return null;
  const updated: BotRun = { ...existing, ...patch, id: runId, ownerId };
  await setRunState(runId, updated);
  return updated;
}

/** List a user's runs, most-recent first. */
export async function listRuns(ownerId: string): Promise<BotRun[]> {
  const ids = await listRunIds(ownerId);
  const runs = await Promise.all(ids.map((id) => getRunState<BotRun>(id)));
  return runs.filter((r): r is BotRun => r !== null);
}

/** Fetch a single run by id (namespaced by owner). */
export async function getRun(ownerId: string, runId: string): Promise<BotRun | null> {
  const run = await getRunState<BotRun>(runId);
  if (!run || run.ownerId !== ownerId) return null;
  return run;
}

/** Mark a run as running (or awaiting input), preserving prior fields. */
export async function markRunning(ownerId: string, runId: string): Promise<void> {
  await patchRun(ownerId, runId, { status: "running" });
}

/** Seal a run with a verdict + dissent. */
export async function sealRun(
  ownerId: string,
  runId: string,
  verdict: string,
  dissent: string,
): Promise<void> {
  await patchRun(ownerId, runId, {
    status: "sealed",
    verdict,
    dissent,
    sealedAt: Date.now(),
  });
}

/** Mark a run failed with an error. */
export async function failRun(
  ownerId: string,
  runId: string,
  error: string,
): Promise<void> {
  await patchRun(ownerId, runId, { status: "failed", error });
}
