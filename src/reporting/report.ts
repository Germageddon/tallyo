import type { ExpenseRow } from '../storage/expenses-repo';
import type { FxService } from '../fx/fx-service';

export type ReportEntry = {
  label: string; // the user's own description
  amountMinor: number; // converted to the target currency
  at: string; // ISO timestamp the expense was logged (created_at)
};

export type Report = {
  targetCurrency: string;
  entries: ReportEntry[]; // most-recent first
  totalMinor: number;
};

/**
 * Build an itemized spending report in a single target currency — one line per logged
 * expense (the user's own wording), most recent first.
 *
 * Every row is converted to `targetCurrency` at the FX rate effective on that row's own
 * `spentOn` date, so mixed-currency expenses are summed only after conversion.
 */
export async function buildReport(
  rows: ExpenseRow[],
  targetCurrency: string,
  fx: FxService,
): Promise<Report> {
  const entries: ReportEntry[] = [];
  let totalMinor = 0;

  for (const row of rows) {
    const { amountMinor } = await fx.convert(
      row.amountMinor,
      row.currency,
      targetCurrency,
      row.spentOn,
    );
    entries.push({ label: row.description.trim() || 'expense', amountMinor, at: row.createdAt });
    totalMinor += amountMinor;
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return { targetCurrency, entries, totalMinor };
}
