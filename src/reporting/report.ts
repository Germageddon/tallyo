import type { ExpenseRow } from '../storage/expenses-repo';
import type { FxService } from '../fx/fx-service';

export type ReportEntry = {
  id: number;
  label: string;
  amountMinor: number; // in the target currency
  at: string; // created_at ISO
};

export type Report = {
  targetCurrency: string;
  entries: ReportEntry[]; // most-recent first
  totalMinor: number;
};

// converts each row at its own spent_on rate before summing
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
    entries.push({ id: row.id, label: row.description.trim() || 'expense', amountMinor, at: row.createdAt });
    totalMinor += amountMinor;
  }

  entries.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));

  return { targetCurrency, entries, totalMinor };
}
