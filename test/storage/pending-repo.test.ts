import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { UsersRepo } from '../../src/storage/users-repo';
import { PendingRepo } from '../../src/storage/pending-repo';
import type { LineItem } from '../../src/parser/types';

let db: Db;
let users: UsersRepo;
let pending: PendingRepo;
let userId: number;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  users = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
  pending = new PendingRepo(db);
  userId = users.upsert('telegram', 'A');
});

const item = (over: Partial<LineItem> = {}): LineItem => ({
  amountMinor: 2000,
  currency: 'USD',
  category: 'Food',
  description: 'lunch',
  spentOn: '2026-06-15',
  ...over,
});

describe('PendingRepo', () => {
  it('creates a pending capture and reads back the items', () => {
    const items = [item(), item({ amountMinor: 500, description: 'coffee' })];
    const id = pending.create(userId, items, 'AWAITING_CONFIRM', '2100-01-01T00:00:00.000Z');

    const got = pending.getPending(userId, id);
    expect(got).toBeDefined();
    expect(got!.id).toBe(id);
    expect(got!.state).toBe('AWAITING_CONFIRM');
    expect(got!.items).toEqual(items);
  });

  it('markCommitted succeeds once then fails on repeat, and hides the row afterwards', () => {
    const id = pending.create(userId, [item()], 'AWAITING_CONFIRM', '2100-01-01T00:00:00.000Z');

    expect(pending.markCommitted(userId, id)).toBe(true);
    expect(pending.markCommitted(userId, id)).toBe(false);
    expect(pending.getPending(userId, id)).toBeUndefined();
  });

  it("does not read another user's pending capture", () => {
    const other = users.upsert('telegram', 'B');
    const id = pending.create(userId, [item()], 'AWAITING_CONFIRM', '2100-01-01T00:00:00.000Z');
    expect(pending.getPending(other, id)).toBeUndefined();
  });
});
