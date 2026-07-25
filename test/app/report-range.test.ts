import { describe, expect, it } from 'vitest';
import { parseRange } from '../../src/app/report-range';

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
