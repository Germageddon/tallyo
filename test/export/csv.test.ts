import { describe, expect, it } from 'vitest';
import { minorToDecimalString, toCsv } from '../../src/export/csv';
import type { ExpenseRow } from '../../src/storage/expenses-repo';

function mk(overrides: Partial<ExpenseRow> & Pick<ExpenseRow, 'amountMinor' | 'currency' | 'description'>): ExpenseRow {
  return {
    id: 1,
    userId: 1,
    category: 'Food',
    spentOn: '2026-06-15',
    createdAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('minorToDecimalString', () => {
  it('renders each currency with its own exponent', () => {
    expect(minorToDecimalString(2000, 'USD')).toBe('20.00'); // 2 decimals
    expect(minorToDecimalString(1000, 'JPY')).toBe('1000'); // 0 decimals
    expect(minorToDecimalString(1500, 'KWD')).toBe('1.500'); // 3 decimals
  });

  it('pads sub-unit values and handles negatives', () => {
    expect(minorToDecimalString(5, 'USD')).toBe('0.05');
    expect(minorToDecimalString(-2000, 'USD')).toBe('-20.00');
    expect(minorToDecimalString(-1500, 'KWD')).toBe('-1.500');
  });
});

describe('toCsv', () => {
  it('emits the exact header and per-currency amounts, with injection + quoting escapes', () => {
    const rows: ExpenseRow[] = [
      mk({ description: '=SUM(A1:A2)', amountMinor: 2000, currency: 'USD', category: 'Food' }),
      mk({ description: 'a,"b', amountMinor: 1000, currency: 'JPY', category: 'Food' }),
      mk({ description: 'dinar', amountMinor: 1500, currency: 'KWD', category: 'Other' }),
    ];

    const csv = toCsv(rows);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(4); // header + 3 rows

    const [header, injectionLine, quotedLine, kwdLine] = lines as [string, string, string, string];

    // Header is exactly as specified.
    expect(header).toBe('date,category,description,amount,currency');

    // Formula-injection guard: leading '=' gets an apostrophe; no comma so not quoted.
    const injectionCells = injectionLine.split(',');
    expect(injectionCells[2]).toBe("'=SUM(A1:A2)");
    expect(injectionCells[2]!.startsWith("'=")).toBe(true);
    expect(injectionLine.endsWith('20.00,USD')).toBe(true); // USD -> 2 decimals

    // Comma + double-quote field is wrapped in quotes with the inner quote doubled.
    expect(quotedLine).toContain('"a,""b"');
    expect(quotedLine.endsWith('1000,JPY')).toBe(true); // JPY -> 0 decimals

    // KWD -> 3 decimals.
    expect(kwdLine.endsWith('1.500,KWD')).toBe(true);
  });
});
