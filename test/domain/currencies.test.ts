import { describe, expect, it } from 'vitest';
import { minorUnits } from '../../src/domain/currencies';

describe('minorUnits', () => {
  it('returns 2 for typical currencies', () => {
    expect(minorUnits('USD')).toBe(2);
    expect(minorUnits('EUR')).toBe(2);
  });
  it('returns 0 for zero-decimal currencies', () => {
    expect(minorUnits('JPY')).toBe(0);
    expect(minorUnits('KRW')).toBe(0);
  });
  it('returns 3 for three-decimal currencies', () => {
    expect(minorUnits('KWD')).toBe(3);
    expect(minorUnits('BHD')).toBe(3);
  });
  it('is case-insensitive', () => {
    expect(minorUnits('jpy')).toBe(0);
  });
  it('defaults to 2 for unknown codes', () => {
    expect(minorUnits('ZZZ')).toBe(2);
  });
});
