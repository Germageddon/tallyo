import { convertMinor } from '../domain/fx';
import type { FxRatesRepo } from '../storage/fx-rates-repo';
import type { FxProvider } from './provider';

export class FxError extends Error {}

/**
 * Resolves EUR-based rates (cache-first, provider on miss) and converts amounts.
 * Historical ECB rates for a past date never change, so a cached conversion is
 * reproducible forever.
 */
export class FxService {
  constructor(
    private readonly repo: FxRatesRepo,
    private readonly provider: FxProvider,
  ) {}

  /** EUR->currency rate effective on-or-before `date`, plus the date actually used. */
  async rateFor(currency: string, date: string): Promise<{ rate: string; rateDate: string }> {
    const c = currency.toUpperCase();
    if (c === 'EUR') return { rate: '1', rateDate: date };

    const cached = this.repo.getOnOrBefore(c, date);
    if (cached) return { rate: cached.rate, rateDate: cached.rateDate };

    const fetched = await this.provider.fetch(date, [c]);
    const rate = fetched.rates[c];
    if (rate === undefined) throw new FxError(`no rate available for ${c} on or before ${date}`);
    this.repo.upsert(fetched.resolvedDate, c, rate);
    return { rate, rateDate: fetched.resolvedDate };
  }

  async convert(
    amountMinor: number,
    from: string,
    to: string,
    date: string,
  ): Promise<{ amountMinor: number; rateDate: string }> {
    // No conversion (and no rate lookup / network) when currencies match.
    if (from.toUpperCase() === to.toUpperCase()) {
      return { amountMinor, rateDate: date };
    }
    const f = await this.rateFor(from, date);
    const t = await this.rateFor(to, date);
    const converted = convertMinor(amountMinor, from, to, f.rate, t.rate);
    // Both legs resolve on-or-before `date`; report the later of the two effective dates.
    const rateDate = f.rateDate > t.rateDate ? f.rateDate : t.rateDate;
    return { amountMinor: converted, rateDate };
  }
}
