import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { FxRatesRepo } from '../../src/storage/fx-rates-repo';
import { FxService } from '../../src/fx/fx-service';
import { StaticFxProvider } from '../../src/fx/provider';
import { buildReport } from '../../src/reporting/report';
import type { ExpenseRow } from '../../src/storage/expenses-repo';

let db: Db;
let fx: FxService;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  fx = new FxService(
    new FxRatesRepo(db),
    new StaticFxProvider({ '2026-06-15': { USD: '1.10', GBP: '0.85' } }),
  );
});

function mk(
  overrides: Partial<ExpenseRow> & Pick<ExpenseRow, 'amountMinor' | 'currency' | 'description' | 'createdAt'>,
): ExpenseRow {
  return {
    id: 1,
    userId: 1,
    category: 'Other',
    spentOn: '2026-06-15',
    ...overrides,
  };
}

describe('buildReport (itemized, most-recent first)', () => {
  it('lists each expense with its converted amount, newest first', async () => {
    const rows: ExpenseRow[] = [
      mk({ amountMinor: 1000, currency: 'EUR', description: 'beers and cigs', createdAt: '2026-06-15T09:00:00Z' }),
      mk({ amountMinor: 850, currency: 'GBP', description: 'cab', createdAt: '2026-06-15T20:00:00Z' }), // 8.50 GBP -> 10 EUR
    ];

    const report = await buildReport(rows, 'EUR', fx);

    expect(report.targetCurrency).toBe('EUR');
    expect(report.totalMinor).toBe(2000);
    // Newest (cab, 20:00) first.
    expect(report.entries.map((e) => e.label)).toEqual(['cab', 'beers and cigs']);
    expect(report.entries[0]!.amountMinor).toBe(1000);
    expect(report.entries[0]!.at).toBe('2026-06-15T20:00:00Z');
  });

  it('returns an empty report for no rows', async () => {
    const empty = await buildReport([], 'EUR', fx);
    expect(empty).toEqual({ targetCurrency: 'EUR', entries: [], totalMinor: 0 });
  });
});
