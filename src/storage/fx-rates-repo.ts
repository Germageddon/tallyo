import type { Db } from './db';

export type FxRate = { rateDate: string; rate: string };

export class FxRatesRepo {
  constructor(private readonly db: Db) {}

  // on-or-before: weekends/holidays have no rate
  getOnOrBefore(quote: string, date: string): FxRate | undefined {
    const row = this.db
      .prepare(
        `SELECT rate_date, rate FROM fx_rates
         WHERE quote = ? AND rate_date <= ?
         ORDER BY rate_date DESC LIMIT 1`,
      )
      .get(quote.toUpperCase(), date) as { rate_date: string; rate: string } | undefined;
    return row ? { rateDate: row.rate_date, rate: row.rate } : undefined;
  }

  upsert(rateDate: string, quote: string, rate: string): void {
    this.db
      .prepare(
        `INSERT INTO fx_rates (rate_date, quote, rate, fetched_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT (rate_date, quote) DO NOTHING`,
      )
      .run(rateDate, quote.toUpperCase(), rate, new Date().toISOString());
  }
}
