// ISO-4217 minor-unit exponents. Default is 2; only the exceptions are listed.
// Source: ISO-4217 published table. Extend the sets if a needed currency is missing.
const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'ISK', 'CLP', 'VND', 'XAF', 'XOF', 'XPF',
  'GNF', 'RWF', 'UGX', 'BIF', 'DJF', 'KMF', 'PYG', 'VUV',
]);

const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'TND', 'IQD', 'JOD', 'LYD']);

export function minorUnits(code: string): number {
  const c = code.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}
