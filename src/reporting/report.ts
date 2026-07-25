import type { ExpenseRow } from '../storage/expenses-repo';
import type { FxService } from '../fx/fx-service';

export type LineTotal = { label: string; amountMinor: number };

export type Report = {
  targetCurrency: string;
  byGroup: LineTotal[];
  totalMinor: number;
};

/**
 * Build a spending report in a single target currency, grouped by the user's own
 * expense description (their exact words) — not by an inferred category.
 *
 * Every row is converted to `targetCurrency` at the FX rate effective on that row's
 * own `spentOn` date, so mixed-currency expenses are summed only after conversion.
 */
export async function buildReport(
  rows: ExpenseRow[],
  targetCurrency: string,
  fx: FxService,
): Promise<Report> {
  const totals = new Map<string, LineTotal>();
  let totalMinor = 0;

  for (const row of rows) {
    const { amountMinor } = await fx.convert(
      row.amountMinor,
      row.currency,
      targetCurrency,
      row.spentOn,
    );
    const label = row.description.trim() || 'expense';
    const key = label.toLowerCase();
    const existing = totals.get(key);
    if (existing) existing.amountMinor += amountMinor;
    else totals.set(key, { label, amountMinor });
    totalMinor += amountMinor;
  }

  const byGroup = [...totals.values()]
    .filter((g) => g.amountMinor !== 0)
    .sort((a, b) => b.amountMinor - a.amountMinor);

  return { targetCurrency, byGroup, totalMinor };
}
