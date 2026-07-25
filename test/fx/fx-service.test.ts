import { beforeEach, describe, expect, it, vi } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { FxRatesRepo } from '../../src/storage/fx-rates-repo';
import { FxService } from '../../src/fx/fx-service';
import { StaticFxProvider } from '../../src/fx/provider';

let db: Db;
let repo: FxRatesRepo;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  repo = new FxRatesRepo(db);
});

const provider = () =>
  new StaticFxProvider({
    '2026-06-12': { USD: '1.10', GBP: '0.85' }, // Friday
  });

describe('FxService', () => {
  it('treats EUR as rate 1 without hitting the provider', async () => {
    const p = provider();
    const spy = vi.spyOn(p, 'fetch');
    const fx = new FxService(repo, p);
    expect(await fx.rateFor('EUR', '2026-06-12')).toEqual({ rate: '1', rateDate: '2026-06-12' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('fetches on a cache miss, then serves from cache', async () => {
    const p = provider();
    const spy = vi.spyOn(p, 'fetch');
    const fx = new FxService(repo, p);
    const first = await fx.rateFor('USD', '2026-06-12');
    const second = await fx.rateFor('USD', '2026-06-12');
    expect(first).toEqual({ rate: '1.10', rateDate: '2026-06-12' });
    expect(second).toEqual(first);
    expect(spy).toHaveBeenCalledTimes(1); // cached the second time
  });

  it('resolves a weekend date to the prior business day', async () => {
    const fx = new FxService(repo, provider());
    const r = await fx.rateFor('USD', '2026-06-13'); // Saturday
    expect(r).toEqual({ rate: '1.10', rateDate: '2026-06-12' });
  });

  it('converts across currencies at the historical rate', async () => {
    const fx = new FxService(repo, provider());
    const out = await fx.convert(1100, 'USD', 'GBP', '2026-06-12'); // 11 USD -> 8.50 GBP
    expect(out.amountMinor).toBe(850);
    expect(out.rateDate).toBe('2026-06-12');
  });
});
