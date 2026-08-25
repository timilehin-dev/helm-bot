import { SEATS, type Seat } from "@quorum/shared";

/**
 * Client-safe seat resolution for the Bots UI.
 *
 * The server resolves seats via `@/lib/bots#resolveSeats`, but that module
 * imports the Redis client and therefore must not be pulled into a client
 * component. This is the same rule (canonical `SEATS` are the source of truth,
 * the chair is always included, empty selection = full council), implemented
 * against the dependency-free `@quorum/shared` types only.
 */
export function resolveSeats(
  seatIds: string[],
  chairId: string,
): { seats: Seat[]; chairId: string } {
  const canonicalChair = SEATS.find((s) => s.chair) ?? SEATS[0];
  const resolvedChairId = SEATS.some((s) => s.id === chairId)
    ? chairId
    : canonicalChair.id;

  const wanted = new Set(seatIds.length ? seatIds : SEATS.map((s) => s.id));
  wanted.add(resolvedChairId);
  const seats = SEATS.filter((s) => wanted.has(s.id));

  return { seats, chairId: resolvedChairId };
}
