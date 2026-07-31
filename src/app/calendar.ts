export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const FULL_MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

function parts(ym: string): { y: number; m: number } | null {
  const match = ym.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const m = Number(match[2]);
  if (m < 1 || m > 12) return null;
  return { y: Number(match[1]), m };
}

export function shiftMonth(ym: string, delta: number): string {
  const p = parts(ym);
  if (!p) return ym;
  return new Date(Date.UTC(p.y, p.m - 1 + delta, 1)).toISOString().slice(0, 7);
}

export function monthLabel(ym: string): string {
  const p = parts(ym);
  if (!p) return ym;
  return `${FULL_MONTHS[p.m - 1]} ${p.y}`;
}

// weeks of 7 cells, Monday first; null = padding before/after the month
export function monthGrid(ym: string): (string | null)[][] {
  const p = parts(ym);
  if (!p) return [];
  const lead = (new Date(Date.UTC(p.y, p.m - 1, 1)).getUTCDay() + 6) % 7;
  const days = new Date(Date.UTC(p.y, p.m, 0)).getUTCDate();

  const cells: (string | null)[] = Array(lead).fill(null);
  for (let d = 1; d <= days; d++) cells.push(`${ym}-${String(d).padStart(2, '0')}`);
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (string | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}
