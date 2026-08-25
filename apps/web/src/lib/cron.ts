/**
 * Minimal cron-expression matcher.
 *
 * Supports the 5-field format `min hour dom mon dow` (what Inngest/the bot's
 * `schedule` field use). Ranges (a-b), lists (a,b,c), steps (*&#47;n, a-b/n) and
 * single values are handled per field. Month/day-of-week are 1-indexed (Sunday=0
 * for dow); names are not expanded — keep schedules numeric, which is what the
 * Inngest cron trigger accepts anyway.
 */

type Field =
  | "minute"
  | "hour"
  | "dayOfMonth"
  | "month"
  | "dayOfWeek";

const RANGES: Record<Field, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6], // 0 = Sunday
};

function parseValue(raw: string, field: Field): number | null {
  const n = Number(raw);
  const [lo, hi] = RANGES[field];
  if (!Number.isInteger(n) || n < lo || n > hi) return null;
  return n;
}

function matchField(raw: string, field: Field, value: number): boolean {
  if (raw === "*") return true;

  // Step syntax: either "*/n" or "a-b/n".
  const stepParts = raw.split("/");
  if (stepParts.length === 2) {
    const base = stepParts[0];
    const step = Number(stepParts[1]);
    if (!Number.isInteger(step) || step <= 0) return false;
    let lo: number;
    let hi: number;
    if (base === "*") {
      [lo, hi] = RANGES[field];
    } else {
      const range = base.split("-");
      const a = parseValue(range[0], field);
      const b = range.length === 2 ? parseValue(range[1], field) : a;
      if (a === null || b === null || a > b) return false;
      lo = a;
      hi = b;
    }
    for (let v = lo; v <= hi; v += step) {
      if (v === value) return true;
    }
    return false;
  }

  // List syntax: a,b,c.
  if (raw.includes(",")) {
    return raw.split(",").some((part) => matchField(part, field, value));
  }

  // Range syntax: a-b.
  if (raw.includes("-")) {
    const range = raw.split("-");
    const a = parseValue(range[0], field);
    const b = parseValue(range[1], field);
    if (a === null || b === null || a > b) return false;
    return value >= a && value <= b;
  }

  const n = parseValue(raw, field);
  return n === value;
}

/** Parse a 5-field cron string into its fields, or null if malformed. */
export function parseCron(expr: string): {
  minute: string;
  hour: string;
  dayOfMonth: string;
  month: string;
  dayOfWeek: string;
} | null {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) return null;
  return {
    minute: parts[0],
    hour: parts[1],
    dayOfMonth: parts[2],
    month: parts[3],
    dayOfWeek: parts[4],
  };
}

/**
 * Does a cron expression fire at the given timestamp?
 */
export function cronMatches(expr: string, at: Date): boolean {
  const c = parseCron(expr);
  if (!c) return false;
  return (
    matchField(c.minute, "minute", at.getMinutes()) &&
    matchField(c.hour, "hour", at.getHours()) &&
    matchField(c.dayOfMonth, "dayOfMonth", at.getDate()) &&
    matchField(c.month, "month", at.getMonth() + 1) &&
    matchField(c.dayOfWeek, "dayOfWeek", at.getDay())
  );
}

/**
 * The next wall-clock time a 5-field cron expression fires, strictly after
 * `after`. Null when the expression is malformed or never matches within the
 * bounded search window (12 years). Used by the UI to show the "next fire"
 * estimate for a scheduled bot.
 *
 * Bounded linear scan: advance minute-by-minute from `after + 1m`, testing each
 * candidate with `cronMatches` until one passes or the window is exhausted.
 * `cronMatches` is cheap; at worst this walks ~6.3M minutes before bailing,
 * which is trivially fast for a single call.
 */
export function nextFire(expr: string, after: Date): Date | null {
  const c = parseCron(expr);
  if (!c) return null;

  const HARD_CAP_MS = 12 * 365 * 24 * 60 * 60 * 1000; // 12 years
  const deadline = after.getTime() + HARD_CAP_MS;
  // Start on the next whole minute so the estimate is stable (doesn't jump
  // with the current second) and is always strictly after `after`.
  const cursor = new Date(after);
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);

  while (cursor.getTime() <= deadline) {
    if (
      matchField(c.minute, "minute", cursor.getMinutes()) &&
      matchField(c.hour, "hour", cursor.getHours()) &&
      matchField(c.dayOfMonth, "dayOfMonth", cursor.getDate()) &&
      matchField(c.month, "month", cursor.getMonth() + 1) &&
      matchField(c.dayOfWeek, "dayOfWeek", cursor.getDay())
    ) {
      return new Date(cursor.getTime());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }

  return null;
}
