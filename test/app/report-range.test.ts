import { describe, expect, it } from 'vitest';
import { monthRangeOf, parseRange } from '../../src/app/report-range';

const now = new Date('2026-06-15T12:00:00Z');

describe('parseRange', () => {
  it('this month', () => {
    expect(parseRange('this month', 'UTC', now)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });
  it('last month', () => {
    expect(parseRange('last month', 'UTC', now)).toEqual({ from: '2026-05-01', to: '2026-05-31' });
  });
  it('today', () => {
    expect(parseRange('today', 'UTC', now)).toEqual({ from: '2026-06-15', to: '2026-06-15' });
  });
  it('empty defaults to this month', () => {
    expect(parseRange('', 'UTC', now)).toEqual({ from: '2026-06-01', to: '2026-06-30' });
  });
  it('explicit range', () => {
    expect(parseRange('2026-01-01 2026-03-31', 'UTC', now)).toEqual({
      from: '2026-01-01',
      to: '2026-03-31',
    });
  });
  it('unrecognized returns null', () => {
    expect(parseRange('whenever', 'UTC', now)).toBeNull();
  });
});

describe('monthRangeOf', () => {
  it('covers the whole calendar month', () => {
    expect(monthRangeOf('2026-02')).toEqual({ from: '2026-02-01', to: '2026-02-28' });
    expect(monthRangeOf('2024-02')).toEqual({ from: '2024-02-01', to: '2024-02-29' });
    expect(monthRangeOf('2026-12')).toEqual({ from: '2026-12-01', to: '2026-12-31' });
  });

  it('rejects malformed or out-of-range months', () => {
    expect(monthRangeOf('2026-13')).toBeNull();
    expect(monthRangeOf('2026-00')).toBeNull();
    expect(monthRangeOf('nope')).toBeNull();
  });
});
