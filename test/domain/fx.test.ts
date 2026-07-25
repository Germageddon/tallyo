import { describe, expect, it } from 'vitest';
import { convertMinor } from '../../src/domain/fx';

describe('convertMinor', () => {
  it('returns the amount unchanged for the same currency', () => {
    expect(convertMinor(2000, 'USD', 'USD', '1.1', '1.1')).toBe(2000);
  });
  it('converts EUR to a quote currency', () => {
    // 20.00 EUR at EUR->USD 1.1 = 22.00 USD
    expect(convertMinor(2000, 'EUR', 'USD', '1', '1.1')).toBe(2200);
  });
  it('converts a quote currency back to EUR', () => {
    expect(convertMinor(2200, 'USD', 'EUR', '1.1', '1')).toBe(2000);
  });
  it('cross-converts via the EUR pivot', () => {
    // 11.00 USD -> /1.1 = 10 EUR -> *0.85 = 8.50 GBP
    expect(convertMinor(1100, 'USD', 'GBP', '1.1', '0.85')).toBe(850);
  });
  it('rounds the final minor unit HALF_EVEN (banker\'s rounding)', () => {
    // 10.00 EUR * 1.0055 = 10.055 USD -> 1005.5 minor -> nearest even = 1006
    expect(convertMinor(1000, 'EUR', 'USD', '1', '1.0055')).toBe(1006);
    // 10.00 EUR * 1.0045 = 10.045 USD -> 1004.5 minor -> nearest even = 1004
    expect(convertMinor(1000, 'EUR', 'USD', '1', '1.0045')).toBe(1004);
  });
  it('respects destination currency exponent (JPY has 0 decimals)', () => {
    // 10.00 EUR * 130 = 1300 JPY (0-decimal, minor == major)
    expect(convertMinor(1000, 'EUR', 'JPY', '1', '130')).toBe(1300);
  });
});
