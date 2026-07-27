import { convertMinor } from '../domain/fx';
import type { FxRatesRepo } from '../storage/fx-rates-repo';
import type { FxProvider } from './provider';

export class FxError extends Error {}

// cache-first: historical ECB rates never change, so a cached conversion stays reproducible
export class FxService {
  constructor(
    private readonly repo: FxRatesRepo,
    private readonly provider: FxProvider,
  ) {}

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
    if (from.toUpperCase() === to.toUpperCase()) {
      return { amountMinor, rateDate: date };
    }
    const f = await this.rateFor(from, date);
    const t = await this.rateFor(to, date);
    const converted = convertMinor(amountMinor, from, to, f.rate, t.rate);
    const rateDate = f.rateDate > t.rateDate ? f.rateDate : t.rateDate;
    return { amountMinor: converted, rateDate };
  }
}
