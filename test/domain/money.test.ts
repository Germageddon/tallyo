import { describe, expect, it } from 'vitest';
import { Money, MoneyError } from '../../src/domain/money';

describe('Money.fromDecimalString', () => {
  it('parses 2-decimal currencies to minor units', () => {
    expect(Money.fromDecimalString('20', 'USD').amountMinor).toBe(2000);
    expect(Money.fromDecimalString('20.5', 'USD').amountMinor).toBe(2050);
    expect(Money.fromDecimalString('20.05', 'USD').amountMinor).toBe(2005);
  });
  it('parses zero-decimal currencies', () => {
    expect(Money.fromDecimalString('1000', 'JPY').amountMinor).toBe(1000);
  });
  it('parses three-decimal currencies', () => {
    expect(Money.fromDecimalString('1.5', 'KWD').amountMinor).toBe(1500);
  });
  it('rejects too many decimal places for the currency', () => {
    expect(() => Money.fromDecimalString('20.123', 'USD')).toThrow(MoneyError);
    expect(() => Money.fromDecimalString('1000.5', 'JPY')).toThrow(MoneyError);
  });
  it('rejects non-numeric input', () => {
    expect(() => Money.fromDecimalString('abc', 'USD')).toThrow(MoneyError);
  });
});

describe('Money', () => {
  it('ofMinor stores the exact integer', () => {
    const m = Money.ofMinor(2000, 'USD');
    expect(m.amountMinor).toBe(2000);
    expect(m.currency).toBe('USD');
  });
  it('rejects a non-integer minor amount', () => {
    expect(() => Money.ofMinor(20.5, 'USD')).toThrow(MoneyError);
  });
  it('formats per currency exponent', () => {
    expect(Money.ofMinor(2000, 'USD').format('en-US')).toBe('$20.00');
    expect(Money.ofMinor(1000, 'JPY').format('en-US')).toContain('1,000');
  });
  it('equals compares amount and currency', () => {
    expect(Money.ofMinor(2000, 'USD').equals(Money.ofMinor(2000, 'USD'))).toBe(true);
    expect(Money.ofMinor(2000, 'USD').equals(Money.ofMinor(2000, 'EUR'))).toBe(false);
  });
});
