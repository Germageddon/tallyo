export type DateRange = { from: string; to: string };

function ymdInTz(now: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

function addDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const dt = new Date(Date.UTC(y!, m! - 1, d!));
  dt.setUTCDate(dt.getUTCDate() + delta);
  return dt.toISOString().slice(0, 10);
}

function monthRange(today: string, offset: number): DateRange {
  const [y, m] = today.split('-').map(Number);
  const first = new Date(Date.UTC(y!, m! - 1 + offset, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
  return { from: first.toISOString().slice(0, 10), to: last.toISOString().slice(0, 10) };
}

/** The date-range choices offered as buttons (key → label). */
export const PERIODS: { key: string; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'last-7', label: 'Last 7 days' },
  { key: 'this-month', label: 'This month' },
  { key: 'last-month', label: 'Last month' },
  { key: 'this-year', label: 'This year' },
  { key: 'last-year', label: 'Last year' },
  { key: 'all', label: 'All time' },
];

/** Resolve a button period key to a concrete range in the user's timezone. */
export function periodRange(key: string, timezone: string, now: Date): DateRange | null {
  const today = ymdInTz(now, timezone);
  switch (key) {
    case 'today':
      return { from: today, to: today };
    case 'this-month':
      return monthRange(today, 0);
    case 'last-month':
      return monthRange(today, -1);
    case 'last-7':
      return { from: addDays(today, -6), to: today };
    case 'this-year': {
      const y = today.slice(0, 4);
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case 'last-year': {
      const y = Number(today.slice(0, 4)) - 1;
      return { from: `${y}-01-01`, to: `${y}-12-31` };
    }
    case 'all':
      return { from: '2000-01-01', to: today };
    default:
      return null;
  }
}

/**
 * Parse a typed `/report` / `/export` argument into a date range, in the user's timezone.
 * Supports: '' or 'this month', 'last month', 'today', and 'YYYY-MM-DD YYYY-MM-DD'.
 * Returns null for anything unrecognized.
 */
export function parseRange(arg: string, timezone: string, now: Date): DateRange | null {
  const today = ymdInTz(now, timezone);
  const a = arg.trim().toLowerCase();
  if (a === '' || a === 'this month') return monthRange(today, 0);
  if (a === 'last month') return monthRange(today, -1);
  if (a === 'today') return { from: today, to: today };
  if (a === 'last 7 days') return { from: addDays(today, -6), to: today };
  if (a === 'this year') return periodRange('this-year', timezone, now);
  if (a === 'last year') return periodRange('last-year', timezone, now);
  if (a === 'all' || a === 'all time') return periodRange('all', timezone, now);
  const two = a.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{4}-\d{2}-\d{2})$/);
  if (two) return { from: two[1]!, to: two[2]! };
  return null;
}
