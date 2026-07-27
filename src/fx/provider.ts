export interface FxProvider {
  // resolves to the latest date on-or-before `date` (ECB skips weekends/holidays)
  fetch(date: string, quotes: string[]): Promise<{ resolvedDate: string; rates: Record<string, string> }>;
}

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

// live path, not covered by the hermetic tests — verify param names against Frankfurter docs
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
