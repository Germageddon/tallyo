import Decimal from 'decimal.js';
import { minorUnits } from './currencies';

// Single HALF_EVEN round via an EUR pivot — no double-rounding drift.
export function convertMinor(
  amountMinor: number,
  from: string,
  to: string,
  rateFromPerEur: string,
  rateToPerEur: string,
): number {
  const fromC = from.toUpperCase();
  const toC = to.toUpperCase();
  if (fromC === toC) return amountMinor;

  const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_EVEN });
  const expFrom = minorUnits(fromC);
  const expTo = minorUnits(toC);

  const majorFrom = new D(amountMinor).div(new D(10).pow(expFrom));
  const rFrom = new D(rateFromPerEur);
  const rTo = new D(rateToPerEur);
  const majorTo = majorFrom.div(rFrom).mul(rTo);
  const minorTo = majorTo.mul(new D(10).pow(expTo)).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
  return minorTo.toNumber();
}
