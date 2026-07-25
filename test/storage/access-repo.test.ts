import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { AccessRepo } from '../../src/storage/access-repo';

let db: Db;
let repo: AccessRepo;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  repo = new AccessRepo(db);
});

describe('AccessRepo', () => {
  it('returns undefined for an unknown ref', () => {
    expect(repo.getStatus('telegram', 'nobody')).toBeUndefined();
  });

  it('approve then getStatus is approved', () => {
    repo.approve('telegram', 'A', 'owner');
    expect(repo.getStatus('telegram', 'A')).toBe('approved');
  });

  it('revoke then getStatus is revoked', () => {
    repo.approve('telegram', 'A', 'owner');
    repo.revoke('telegram', 'A');
    expect(repo.getStatus('telegram', 'A')).toBe('revoked');
  });

  it('revoke works as an upsert even without a prior row', () => {
    repo.revoke('telegram', 'B');
    expect(repo.getStatus('telegram', 'B')).toBe('revoked');
  });
});
