export interface FxProvider {
  /**
   * Fetch EUR-based rates for `quotes`, resolved to the latest publication date
   * on-or-before `date` (ECB has no weekend/holiday rate). `resolvedDate` is the
   * actual date the returned rates belong to.
   */
  fetch(date: string, quotes: string[]): Promise<{ resolvedDate: string; rates: Record<string, string> }>;
}

/**
 * Offline provider backed by a static table (`{ 'YYYY-MM-DD': { USD: '1.09' } }`).
 * Resolves to the latest table date on-or-before the requested date — the same
 * weekend/holiday behaviour as ECB. Used by tests and by a future fully-offline mode.
 */
export class StaticFxProvider implements FxProvider {
  constructor(private readonly table: Record<string, Record<string, string>>) {}

  async fetch(date: string, quotes: string[]) {
    const resolvedDate = Object.keys(this.table)
      .filter((d) => d <= date)
      .sort()
      .at(-1);
    if (!resolvedDate) throw new Error(`no rates on or before ${date}`);
    const day = this.table[resolvedDate]!;
    const rates: Record<string, string> = {};
    for (const q of quotes) {
      const r = day[q.toUpperCase()];
      if (r !== undefined) rates[q.toUpperCase()] = r;
    }
    return { resolvedDate, rates };
  }
}

/**
 * Live provider: ECB reference rates via Frankfurter (free, no key).
 * NOTE: confirm the exact query-param names / base URL against current Frankfurter
 * docs when wiring live FX — this path is not exercised by the hermetic test suite.
 */
export class FrankfurterProvider implements FxProvider {
  constructor(private readonly baseUrl = 'https://api.frankfurter.app') {}

  async fetch(date: string, quotes: string[]) {
    const symbols = quotes.map((q) => q.toUpperCase()).join(',');
    const res = await fetch(`${this.baseUrl}/${date}?base=EUR&symbols=${symbols}`);
    if (!res.ok) throw new Error(`frankfurter ${res.status}`);
    const data = (await res.json()) as { date: string; rates: Record<string, number> };
    const rates: Record<string, string> = {};
    for (const [k, v] of Object.entries(data.rates)) rates[k] = String(v);
    return { resolvedDate: data.date, rates };
  }
}
