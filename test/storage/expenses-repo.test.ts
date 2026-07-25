import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { UsersRepo } from '../../src/storage/users-repo';
import { ExpensesRepo, type NewExpense } from '../../src/storage/expenses-repo';

let db: Db;
let users: UsersRepo;
let expenses: ExpensesRepo;
let userA: number;
let userB: number;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  users = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
  expenses = new ExpensesRepo(db);
  userA = users.upsert('telegram', 'A');
  userB = users.upsert('telegram', 'B');
});

const entry = (over: Partial<NewExpense> = {}): NewExpense => ({
  amountMinor: 2000,
  currency: 'USD',
  category: 'Food',
  description: 'lunch',
  spentOn: '2026-06-15',
  ...over,
});

describe('ExpensesRepo', () => {
  it('inserts and lists within a date range for the owner only', () => {
    expenses.insert(userA, entry({ spentOn: '2026-06-15' }));
    expenses.insert(userA, entry({ spentOn: '2026-07-01' }));
    const june = expenses.listByRange(userA, '2026-06-01', '2026-06-30');
    expect(june).toHaveLength(1);
    expect(june[0]!.description).toBe('lunch');
  });
  it("does not leak another user's rows", () => {
    expenses.insert(userA, entry());
    expect(expenses.listByRange(userB, '2026-01-01', '2026-12-31')).toHaveLength(0);
  });
  it("soft-deletes only the owner's row and hides it from reports", () => {
    const id = expenses.insert(userA, entry());
    expect(expenses.softDelete(userB, id)).toBe(false); // not the owner
    expect(expenses.softDelete(userA, id)).toBe(true);
    expect(expenses.listByRange(userA, '2026-01-01', '2026-12-31')).toHaveLength(0);
  });
});
