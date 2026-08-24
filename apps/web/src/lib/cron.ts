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