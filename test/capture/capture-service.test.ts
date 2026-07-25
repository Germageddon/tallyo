import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { UsersRepo } from '../../src/storage/users-repo';
import { ExpensesRepo } from '../../src/storage/expenses-repo';
import { PendingRepo } from '../../src/storage/pending-repo';
import { CaptureService } from '../../src/capture/capture-service';
import type { LineItem, ParseOutcome } from '../../src/parser/types';

let db: Db;
let users: UsersRepo;
let expenses: ExpensesRepo;
let pending: PendingRepo;
let capture: CaptureService;
let userId: number;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  users = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
  expenses = new ExpensesRepo(db);
  pending = new PendingRepo(db);
  capture = new CaptureService(db, pending, expenses);
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

const okOutcome = (
  confidence: 'high' | 'low',
  items: LineItem[] = [item()],
): ParseOutcome => ({ ok: true, items, confidence, source: 'rules' });

const OPTS = { autoAcceptHigh: true, expiresAt: '2100-01-01T00:00:00.000Z' };
const ALL_TIME = ['2000-01-01', '2100-01-01'] as const;

describe('CaptureService', () => {
  it('auto-saves a high-confidence outcome when autoAcceptHigh is on', () => {
    const res = capture.submit(userId, okOutcome('high'), OPTS);
    expect(res.kind).toBe('saved');
    if (res.kind !== 'saved') throw new Error('expected saved');
    expect(res.ids).toHaveLength(1);

    const rows = expenses.listByRange(userId, ALL_TIME[0], ALL_TIME[1]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.description).toBe('lunch');
  });

  it('routes a low-confidence outcome to confirm without saving yet', () => {
    const res = capture.submit(userId, okOutcome('low'), OPTS);
    expect(res.kind).toBe('confirm');
    if (res.kind !== 'confirm') throw new Error('expected confirm');
    expect(res.items).toHaveLength(1);
    expect(expenses.listByRange(userId, ALL_TIME[0], ALL_TIME[1])).toHaveLength(0);
  });

  it('confirm saves the staged items, and a repeat confirm is gone with no double-insert', () => {
    const submitted = capture.submit(userId, okOutcome('low'), OPTS);
    if (submitted.kind !== 'confirm') throw new Error('expected confirm');

    const first = capture.confirm(userId, submitted.captureId);
    expect(first.kind).toBe('saved');
    if (first.kind !== 'saved') throw new Error('expected saved');
    expect(first.ids).toHaveLength(1);

    const countAfterFirst = expenses.listByRange(userId, ALL_TIME[0], ALL_TIME[1]).length;
    expect(countAfterFirst).toBe(1);

    const second = capture.confirm(userId, submitted.captureId);
    expect(second.kind).toBe('gone');

    const countAfterSecond = expenses.listByRange(userId, ALL_TIME[0], ALL_TIME[1]).length;
    expect(countAfterSecond).toBe(countAfterFirst);
  });

  it('rejects an unparseable outcome', () => {
    const res = capture.submit(userId, { ok: false, reason: 'unparseable' }, OPTS);
    expect(res.kind).toBe('rejected');
    if (res.kind !== 'rejected') throw new Error('expected rejected');
    expect(res.reason).toBe('unparseable');
  });
});
