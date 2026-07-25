import { describe, expect, it } from 'vitest';
import { normalizeAmount, resolveCurrencyToken, resolveDate } from '../../src/parser/resolution';

describe('resolveCurrencyToken', () => {
  it('maps symbols to ISO codes', () => {
    expect(resolveCurrencyToken('$', 'USD')).toBe('USD');
    expect(resolveCurrencyToken('€', 'USD')).toBe('EUR');
    expect(resolveCurrencyToken('£', 'USD')).toBe('GBP');
    expect(resolveCurrencyToken('¥', 'USD')).toBe('JPY');
  });
  it('uppercases a known 3-letter code regardless of case', () => {
    expect(resolveCurrencyToken('eur', 'USD')).toBe('EUR');
    expect(resolveCurrencyToken('Jpy', 'USD')).toBe('JPY');
  });
  it('falls back to the (uppercased) default for null or unknown tokens', () => {
    expect(resolveCurrencyToken(null, 'usd')).toBe('USD');
    expect(resolveCurrencyToken('zzz', 'eur')).toBe('EUR');
    expect(resolveCurrencyToken('food', 'usd')).toBe('USD');
  });
});

describe('normalizeAmount', () => {
  it('treats the last separator as the decimal when both are present', () => {
    expect(normalizeAmount('1.234,56')).toBe('1234.56'); // EU
    expect(normalizeAmount('1,234.56')).toBe('1234.56'); // US
  });
  it('treats a lone comma with 1-2 trailing digits as a decimal', () => {
    expect(normalizeAmount('1,50')).toBe('1.50');
  });
  it('treats a lone comma with 3+ trailing digits as thousands', () => {
    expect(normalizeAmount('1,234')).toBe('1234');
  });
  it('leaves plain / dot-decimal numbers unchanged', () => {
    expect(normalizeAmount('5')).toBe('5');
    expect(normalizeAmount('1234.56')).toBe('1234.56');
  });
});

describe('resolveDate', () => {
  const now = new Date('2026-07-15T12:00:00Z');

  it('resolves null and today to today-in-tz', () => {
    expect(resolveDate(null, 'UTC', now)).toBe('2026-07-15');
    expect(resolveDate('today', 'UTC', now)).toBe('2026-07-15');
  });
  it('resolves yesterday to -1 day', () => {
    expect(resolveDate('yesterday', 'UTC', now)).toBe('2026-07-14');
  });
  it('resolves "N days ago"', () => {
    expect(resolveDate('3 days ago', 'UTC', now)).toBe('2026-07-12');
  });
  it('passes through an explicit ISO date', () => {
    expect(resolveDate('2026-01-01', 'UTC', now)).toBe('2026-01-01');
  });
  it('falls back to today for anything unrecognized', () => {
    expect(resolveDate('sometime last week', 'UTC', now)).toBe('2026-07-15');
  });
});
