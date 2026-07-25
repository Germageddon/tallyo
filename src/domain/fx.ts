import Decimal from 'decimal.js';
import { minorUnits } from './currencies';

/**
 * Convert an integer minor-unit amount from one currency to another using ECB-style
 * EUR-based rates (units of the currency per 1 EUR; EUR itself is rate "1").
 *
 * The whole computation runs at high precision through an implicit EUR pivot and is
 * rounded exactly once, HALF_EVEN, to the destination currency's minor units — so
 * cross-rates never accumulate double-rounding drift.
 */
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
  // from -> EUR (divide by rFrom) -> to (multiply by rTo), full precision.
  const majorTo = majorFrom.div(rFrom).mul(rTo);
  const minorTo = majorTo.mul(new D(10).pow(expTo)).toDecimalPlaces(0, Decimal.ROUND_HALF_EVEN);
  return minorTo.toNumber();
}
