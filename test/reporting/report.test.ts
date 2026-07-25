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

function mk(overrides: Partial<ExpenseRow> & Pick<ExpenseRow, 'amountMinor' | 'currency' | 'category'>): ExpenseRow {
  return {
    id: 1,
    userId: 1,
    description: '',
    spentOn: '2026-06-15',
    createdAt: '2026-06-15T00:00:00.000Z',
    ...overrides,
  };
}

describe('buildReport', () => {
  it('converts each row to the target currency and sums per category', async () => {
    const rows: ExpenseRow[] = [
      mk({ amountMinor: 1000, currency: 'EUR', category: 'Food', description: 'lunch' }), // 10.00 EUR
      mk({ amountMinor: 1100, currency: 'USD', category: 'Food', description: 'dinner' }), // 11.00 USD -> 10.00 EUR
      mk({ amountMinor: 850, currency: 'GBP', category: 'Transport', description: 'taxi' }), // 8.50 GBP -> 10.00 EUR
    ];

    const report = await buildReport(rows, 'EUR', fx);

    expect(report.targetCurrency).toBe('EUR');
    expect(report.totalMinor).toBe(3000);

    const food = report.byCategory.find((c) => c.category === 'Food');
    const transport = report.byCategory.find((c) => c.category === 'Transport');
    expect(food?.amountMinor).toBe(2000); // 1000 EUR + 1000 (from USD)
    expect(transport?.amountMinor).toBe(1000); // from GBP

    // Sorted by amountMinor descending, Food (2000) before Transport (1000).
    expect(report.byCategory.map((c) => c.category)).toEqual(['Food', 'Transport']);
    expect(report.byCategory.map((c) => c.amountMinor)).toEqual([2000, 1000]);
  });

  it('omits zero-sum categories and returns an empty report for no rows', async () => {
    const empty = await buildReport([], 'EUR', fx);
    expect(empty).toEqual({ targetCurrency: 'EUR', byCategory: [], totalMinor: 0 });
  });
});
