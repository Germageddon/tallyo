import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { UsersRepo } from '../../src/storage/users-repo';

let db: Db;
let repo: UsersRepo;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  repo = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
});

describe('UsersRepo', () => {
  it('creates a user with defaults on first upsert and is idempotent', () => {
    const id1 = repo.upsert('telegram', '123');
    const id2 = repo.upsert('telegram', '123');
    expect(id1).toBe(id2);
    const u = repo.getById(id1)!;
    expect(u.defaultCurrency).toBe('USD');
    expect(u.timezone).toBe('UTC');
  });
  it('keeps the same numeric id on different platforms separate', () => {
    const tg = repo.upsert('telegram', '123');
    const dc = repo.upsert('discord', '123');
    expect(tg).not.toBe(dc);
  });
  it('updates settings', () => {
    const id = repo.upsert('telegram', '123');
    repo.updateSettings(id, { displayCurrency: 'EUR', timezone: 'Europe/Berlin' });
    const u = repo.getById(id)!;
    expect(u.displayCurrency).toBe('EUR');
    expect(u.timezone).toBe('Europe/Berlin');
  });
});
