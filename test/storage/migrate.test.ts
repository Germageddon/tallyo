import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';

function tableNames(db: ReturnType<typeof openDb>): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map((r) => (r as { name: string }).name);
}

describe('migrate', () => {
  it('creates the schema and sets user_version', () => {
    const db = openDb(':memory:');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    const names = tableNames(db);
    for (const t of ['users', 'expenses', 'pending_captures', 'fx_rates', 'access', 'usage']) {
      expect(names).toContain(t);
    }
    db.close();
  });
  it('is idempotent', () => {
    const db = openDb(':memory:');
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    db.close();
  });
});
