import { describe, expect, it } from 'vitest';
import { minorToDecimalString, toCsv } from '../../src/export/csv';
import type { ExpenseRow } from '../../src/storage/expenses-repo';

function mk(overrides: Partial<ExpenseRow> & Pick<ExpenseRow, 'amountMinor' | 'currency' | 'description'>): ExpenseRow {
  return {
    id: 1,
    userId: 1,
    category: 'Other',
    spentOn: '2026-06-15',
    createdAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('minorToDecimalString', () => {
  it('renders each currency with its own exponent', () => {
    expect(minorToDecimalString(2000, 'USD')).toBe('20.00');
    expect(minorToDecimalString(1000, 'JPY')).toBe('1000');
    expect(minorToDecimalString(1500, 'KWD')).toBe('1.500');
  });

  it('pads sub-unit values and handles negatives', () => {
    expect(minorToDecimalString(5, 'USD')).toBe('0.05');
    expect(minorToDecimalString(-2000, 'USD')).toBe('-20.00');
    expect(minorToDecimalString(-1500, 'KWD')).toBe('-1.500');
  });
});

describe('toCsv', () => {
  it('emits the header (no category) and per-currency amounts, with injection + quoting escapes', () => {
    const rows: ExpenseRow[] = [
      mk({ description: '=SUM(A1:A2)', amountMinor: 2000, currency: 'USD' }),
      mk({ description: 'a,"b', amountMinor: 1000, currency: 'JPY' }),
      mk({ description: 'dinar', amountMinor: 1500, currency: 'KWD' }),
    ];

    const lines = toCsv(rows).split('\n');
    expect(lines).toHaveLength(4); // header + 3 rows

    const [header, injectionLine, quotedLine, kwdLine] = lines as [string, string, string, string];
    expect(header).toBe('date,description,amount,currency');

    // description is now column index 1; leading '=' gets an apostrophe.
    expect(injectionLine.split(',')[1]).toBe("'=SUM(A1:A2)");
    expect(injectionLine.endsWith('20.00,USD')).toBe(true);

    expect(quotedLine).toContain('"a,""b"');
    expect(quotedLine.endsWith('1000,JPY')).toBe(true);

    expect(kwdLine.endsWith('1.500,KWD')).toBe(true);
  });

  it('appends a TOTAL row when a total is given', () => {
    const rows: ExpenseRow[] = [mk({ description: 'coffee', amountMinor: 500, currency: 'USD' })];
    const lines = toCsv(rows, { amountMinor: 3525, currency: 'USD' }).split('\n');
    expect(lines.at(-1)).toBe(',TOTAL,35.25,USD');
  });
});
