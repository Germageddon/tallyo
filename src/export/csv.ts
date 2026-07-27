import type { ExpenseRow } from '../storage/expenses-repo';
import { minorUnits } from '../domain/currencies';

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

// formula-injection guard, then RFC-4180 quoting
function escapeField(field: string): string {
  let s = field;
  const first = s.charAt(0);
  if (first === '=' || first === '+' || first === '-' || first === '@' || first === '\t' || first === '\r') {
    s = `'${s}`;
  }
  if (/[",\r\n]/.test(s)) {
    s = `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

const HEADER = 'date,description,amount,currency';

export function toCsv(rows: ExpenseRow[], total?: { amountMinor: number; currency: string }): string {
  const lines = [HEADER];

  for (const row of rows) {
    lines.push(
      [row.spentOn, row.description, minorToDecimalString(row.amountMinor, row.currency), row.currency]
        .map(escapeField)
        .join(','),
    );
  }

  if (total) {
    lines.push(
      ['', 'TOTAL', minorToDecimalString(total.amountMinor, total.currency), total.currency]
        .map(escapeField)
        .join(','),
    );
  }

  return lines.join('\n');
}
