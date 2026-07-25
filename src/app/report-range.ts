export type DateRange = { from: string; to: string };

function ymdInTz(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function monthRange(today: string, offset: number): DateRange {
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + offset, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/**
 * Parse a `/report` / `/export` argument into a date range, in the user's timezone.
 * Supports: '' or 'this month', 'last month', 'today', and 'YYYY-MM-DD YYYY-MM-DD'.
 * Returns null for anything unrecognized.
 */
export function parseRange(arg: string, timezone: string, now: Date): DateRange | null {
  const today = ymdInTz(now, timezone);
  const a = arg.trim().toLowerCase();
  if (a === '' || a === 'this month') return monthRange(today, 0);
  if (a === 'last month') return monthRange(today, -1);
  if (a === 'today') return { from: today, to: today };
  const two = a.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
  if (two) return { from: two[1]!, to: two[2]! };
  return null;
}
