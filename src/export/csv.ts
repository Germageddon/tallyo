import type { ExpenseRow } from '../storage/expenses-repo';
import { minorUnits } from '../domain/currencies';

/**
 * Render an integer minor-unit amount as a decimal string using the currency's
 * ISO-4217 exponent: 2000/USD -> "20.00", 1000/JPY -> "1000", 1500/KWD -> "1.500".
 * Negatives keep a leading "-".
 */
export function minorToDecimalString(amountMinor: number, currency: string): string {
  const exp = minorUnits(currency);
  const negative = amountMinor < 0;
  const digits = String(Math.abs(amountMinor));

  let body: string;
  if (exp === 0) {
    body = digits;
  } else {
    const padded = digits.padStart(exp + 1, '0');
    const cut = padded.length - exp;
    body = `${padded.slice(0, cut)}.${padded.slice(cut)}`;
  }

  return negative ? `-${body}` : body;
}

/**
 * Escape a single CSV field, in this exact order:
 *   1. Formula-injection guard — if the field starts with `=`, `+`, `-`, `@`, a TAB
 *      or a CR, prepend a single apostrophe so spreadsheets treat it as text.
 *   2. RFC-4180 quoting — if the (possibly prefixed) field contains a comma, double
 *      quote, CR or LF, wrap it in double quotes and double any internal quotes.
 */
function escapeField(field: string): string {
  let s = field;

  const first = s.charAt(0);
  if (
    first === '=' ||
    first === '+' ||
    first === '-' ||
    first === '@' ||
    first === '\t' ||
    first === '\r'
  ) {
    s = `'${s}`;
  }

  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }

  return s;
}

const HEADER = 'date,category,description,amount,currency';

/**
 * Serialize expense rows to CSV. Header is fixed; each row emits
 * date, category, description, amount (decimal string), currency — every field run
 * through the formula-injection + quoting rules above. Lines are LF-joined.
 */
export function toCsv(rows: ExpenseRow[]): string {
  const lines = [HEADER];

  for (const row of rows) {
    const cells = [
      row.spentOn,
      row.category,
      row.description,
      minorToDecimalString(row.amountMinor, row.currency),
      row.currency,
    ].map(escapeField);
    lines.push(cells.join(','));
  }

  return lines.join('\n');
}
