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

describe('buildReport (grouped by description)', () => {
  it('groups by the user\'s wording and converts each row at its date rate', async () => {
    const rows: ExpenseRow[] = [
      mk({ amountMinor: 1000, currency: 'EUR', description: 'beers and cigs' }), // 10.00 EUR
      mk({ amountMinor: 1100, currency: 'USD', description: 'Beers and Cigs' }), // 11 USD -> 10 EUR (same group, case-insensitive)
      mk({ amountMinor: 850, currency: 'GBP', description: 'cab' }), // 8.50 GBP -> 10.00 EUR
    ];

    const report = await buildReport(rows, 'EUR', fx);

    expect(report.targetCurrency).toBe('EUR');
    expect(report.totalMinor).toBe(3000);

    const beers = report.byGroup.find((g) => g.label.toLowerCase() === 'beers and cigs');
    expect(beers?.amountMinor).toBe(2000); // 1000 EUR + 1000 (from USD)
    // Sorted by amount descending, "beers and cigs" (2000) before "cab" (1000).
    expect(report.byGroup[0]!.label.toLowerCase()).toBe('beers and cigs');
    expect(report.byGroup.map((g) => g.amountMinor)).toEqual([2000, 1000]);
  });

  it('returns an empty report for no rows', async () => {
    const empty = await buildReport([], 'EUR', fx);
    expect(empty).toEqual({ targetCurrency: 'EUR', byGroup: [], totalMinor: 0 });
  });
});
