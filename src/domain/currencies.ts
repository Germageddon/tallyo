// ISO-4217 minor units; default 2, only exceptions listed.
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
