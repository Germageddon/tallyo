import { describe, expect, it } from 'vitest';
import { monthGrid, monthLabel, shiftMonth } from '../../src/app/calendar';

describe('shiftMonth', () => {
  it('moves within and across years', () => {
    expect(shiftMonth('2026-08', 1)).toBe('2026-09');
    expect(shiftMonth('2026-08', -1)).toBe('2026-07');
    expect(shiftMonth('2026-12', 1)).toBe('2027-01');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
  });
});

describe('monthLabel', () => {
  it('renders a readable month and year', () => {
    expect(monthLabel('2026-08')).toBe('August 2026');
    expect(monthLabel('2026-01')).toBe('January 2026');
  });
});

describe('monthGrid', () => {
  it('lays out weeks of 7 starting Monday, padded with nulls', () => {
    // 2026-08-01 is a Saturday, so the first week has 5 leading blanks
    const weeks = monthGrid('2026-08');
    for (const w of weeks) expect(w).toHaveLength(7);

    const first = weeks[0]!;
    expect(first.slice(0, 5).every((c) => c === null)).toBe(true);
    expect(first[5]).toBe('2026-08-01');
    expect(first[6]).toBe('2026-08-02');

    const days = weeks.flat().filter(Boolean);
    expect(days).toHaveLength(31);
    expect(days.at(-1)).toBe('2026-08-31');
  });

  it('handles a leap February', () => {
    const days = monthGrid('2024-02').flat().filter(Boolean);
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe('2024-02-29');
  });

  it('returns nothing for a malformed month', () => {
    expect(monthGrid('nope')).toEqual([]);
    expect(monthGrid('2026-13')).toEqual([]);
  });
});
