import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { UsageRepo } from '../../src/storage/usage-repo';

let db: Db;
let repo: UsageRepo;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  repo = new UsageRepo(db);
});

describe('UsageRepo', () => {
  it('returns zeros for an unknown ref/day', () => {
    expect(repo.get('telegram', 'A', '2026-07-25')).toEqual({
      msgCount: 0,
      llmCalls: 0,
      tokens: 0,
    });
  });

  it('increment creates the row then adds to the field', () => {
    repo.increment('telegram', 'A', '2026-07-25', 'msg_count');
    repo.increment('telegram', 'A', '2026-07-25', 'msg_count');
    repo.increment('telegram', 'A', '2026-07-25', 'tokens', 50);
    expect(repo.get('telegram', 'A', '2026-07-25')).toEqual({
      msgCount: 2,
      llmCalls: 0,
      tokens: 50,
    });
  });

  it('keeps separate days separate', () => {
    repo.increment('telegram', 'A', '2026-07-25', 'msg_count', 3);
    repo.increment('telegram', 'A', '2026-07-26', 'msg_count');
    expect(repo.get('telegram', 'A', '2026-07-25').msgCount).toBe(3);
    expect(repo.get('telegram', 'A', '2026-07-26').msgCount).toBe(1);
  });

  it('globalDayTotal sums a field across two users for that day', () => {
    repo.increment('telegram', 'A', '2026-07-25', 'llm_calls', 2);
    repo.increment('telegram', 'B', '2026-07-25', 'llm_calls', 5);
    repo.increment('telegram', 'B', '2026-07-26', 'llm_calls', 9); // other day, excluded
    expect(repo.globalDayTotal('2026-07-25', 'llm_calls')).toBe(7);
  });

  it('globalDayTotal returns 0 when there is no data', () => {
    expect(repo.globalDayTotal('2026-01-01', 'tokens')).toBe(0);
  });
});
