import type { ExpenseRow } from '../storage/expenses-repo';
import type { FxService } from '../fx/fx-service';
import type { Category } from '../domain/categories';

export type CategoryTotal = { category: Category; amountMinor: number };

export type Report = {
  targetCurrency: string;
  byCategory: CategoryTotal[];
  totalMinor: number;
};

/**
 * Build a per-category spending report in a single target currency.
 *
 * Every row is converted to `targetCurrency` at the FX rate effective on that row's
 * own `spentOn` date, so mixed-currency expenses are summed only after conversion —
 * raw `amountMinor` values in different currencies are never added together.
 */
export async function buildReport(
  rows: ExpenseRow[],
  targetCurrency: string,
  fx: FxService,
): Promise<Report> {
  const totals = new Map<string, number>();
  let totalMinor = 0;

  for (const row of rows) {
    const { amountMinor } = await fx.convert(
      row.amountMinor,
      row.currency,
      targetCurrency,
      row.spentOn,
    );
    totals.set(row.category, (totals.get(row.category) ?? 0) + amountMinor);
    totalMinor += amountMinor;
  }

  const byCategory: CategoryTotal[] = [...totals.entries()]
    .filter(([, amountMinor]) => amountMinor !== 0)
    .map(([category, amountMinor]) => ({ category: category as Category, amountMinor }))
    .sort((a, b) => b.amountMinor - a.amountMinor);

  return { targetCurrency, byCategory, totalMinor };
}
