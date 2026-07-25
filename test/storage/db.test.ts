import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/storage/db';

describe('openDb', () => {
  it('enables foreign keys and a busy timeout', () => {
    const db = openDb(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    db.close();
  });
});
