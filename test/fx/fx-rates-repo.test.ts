import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { FxRatesRepo } from '../../src/storage/fx-rates-repo';

let db: Db;
let repo: FxRatesRepo;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  repo = new FxRatesRepo(db);
});

describe('FxRatesRepo', () => {
  it('returns the most recent rate on or before a date (weekend resolution)', () => {
    repo.upsert('2026-06-12', 'USD', '1.10'); // Friday
    // Saturday query resolves to Friday's rate
    expect(repo.getOnOrBefore('USD', '2026-06-13')).toEqual({ rateDate: '2026-06-12', rate: '1.10' });
  });
  it('returns undefined when nothing is on or before the date', () => {
    repo.upsert('2026-06-12', 'USD', '1.10');
    expect(repo.getOnOrBefore('USD', '2026-06-11')).toBeUndefined();
  });
  it('upsert is idempotent on (rate_date, quote)', () => {
    repo.upsert('2026-06-12', 'USD', '1.10');
    repo.upsert('2026-06-12', 'USD', '9.99'); // ignored
    expect(repo.getOnOrBefore('USD', '2026-06-12')!.rate).toBe('1.10');
  });
});
