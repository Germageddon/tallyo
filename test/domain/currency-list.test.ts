import { describe, expect, it } from 'vitest';
import { ALL_CURRENCIES, COMMON_CURRENCIES } from '../../src/domain/currency-list';

describe('ALL_CURRENCIES', () => {
  it('has at least 150 entries', () => {
    expect(ALL_CURRENCIES.length).toBeGreaterThanOrEqual(150);
  });

  it('every code is a 3-letter uppercase code', () => {
    for (const { code } of ALL_CURRENCIES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it('has no duplicate codes', () => {
    const codes = ALL_CURRENCIES.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('contains the expected currencies', () => {
    const codes = new Set(ALL_CURRENCIES.map((c) => c.code));
    for (const expected of ['USD', 'EUR', 'GBP', 'JPY', 'KWD', 'LBP', 'BHD']) {
      expect(codes.has(expected)).toBe(true);
    }
  });

  it('is sorted alphabetically by code', () => {
    const codes = ALL_CURRENCIES.map((c) => c.code);
    const sorted = [...codes].sort();
    expect(codes).toEqual(sorted);
  });

  it('every entry has a non-empty name', () => {
    for (const { name } of ALL_CURRENCIES) {
      expect(name.length).toBeGreaterThan(0);
    }
  });
});

describe('COMMON_CURRENCIES', () => {
  it('is the expected quick-pick list', () => {
    expect(COMMON_CURRENCIES).toEqual([
      'USD', 'EUR', 'GBP', 'JPY', 'CHF', 'CAD', 'AUD', 'CNY', 'INR',
    ]);
  });

  it('only lists codes present in ALL_CURRENCIES', () => {
    const codes = new Set(ALL_CURRENCIES.map((c) => c.code));
    for (const code of COMMON_CURRENCIES) {
      expect(codes.has(code)).toBe(true);
    }
  });
});
