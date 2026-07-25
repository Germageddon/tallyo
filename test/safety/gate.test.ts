import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { AccessRepo } from '../../src/storage/access-repo';
import { UsageRepo } from '../../src/storage/usage-repo';
import { RateLimiter } from '../../src/safety/rate-limiter';
import { Gate, type GateConfig, type Ref } from '../../src/safety/gate';

const OWNER: Ref = { platform: 'telegram', platformUserId: 'owner' };
const USER: Ref = { platform: 'telegram', platformUserId: 'user' };

let db: Db;
let access: AccessRepo;
let usage: UsageRepo;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  access = new AccessRepo(db);
  usage = new UsageRepo(db);
});

function makeGate(over: Partial<GateConfig> = {}): Gate {
  const config: GateConfig = {
    accessMode: 'allowlist',
    ownerRef: OWNER,
    maxInputChars: 20,
    dailyMsgQuota: 2,
    ...over,
  };
  const limiter = new RateLimiter(5, 60_000, () => 0); // generous; fixed clock
  return new Gate(access, usage, limiter, config, () => new Date('2026-07-25T12:00:00.000Z'));
}

describe('Gate.check', () => {
  it('(a) rejects over-long text without recording usage', () => {
    const gate = makeGate();
    const res = gate.check(OWNER, 'x'.repeat(21));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reply).toContain('too long');
    expect(usage.get(OWNER.platform, OWNER.platformUserId, '2026-07-25').msgCount).toBe(0);
  });

  it('(b) rejects a non-allowlisted user in allowlist mode', () => {
    const gate = makeGate();
    const res = gate.check(USER, 'coffee 5');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reply).toContain('private');
  });

  it('(c) allows the owner in allowlist mode', () => {
    const gate = makeGate();
    expect(gate.check(OWNER, 'coffee 5').ok).toBe(true);
  });

  it('(d) open mode allows anyone', () => {
    const gate = makeGate({ accessMode: 'open' });
    expect(gate.check(USER, 'coffee 5').ok).toBe(true);
  });

  it('(e) quota-rejects the 3rd message after 2 allowed (non-owner)', () => {
    const gate = makeGate({ accessMode: 'open' });
    expect(gate.check(USER, 'a').ok).toBe(true);
    expect(gate.check(USER, 'b').ok).toBe(true);
    const res = gate.check(USER, 'c');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reply).toContain("today's limit");
  });

  it('(f) allows an approved user in allowlist mode', () => {
    access.approve(USER.platform, USER.platformUserId, 'owner');
    const gate = makeGate();
    expect(gate.check(USER, 'coffee 5').ok).toBe(true);
  });

  it('rejects a revoked user even when they were approved', () => {
    access.approve(USER.platform, USER.platformUserId, 'owner');
    access.revoke(USER.platform, USER.platformUserId);
    const gate = makeGate();
    const res = gate.check(USER, 'coffee 5');
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reply).toContain('revoked');
  });

  it('the owner is exempt from the daily quota', () => {
    const gate = makeGate();
    expect(gate.check(OWNER, 'a').ok).toBe(true);
    expect(gate.check(OWNER, 'b').ok).toBe(true);
    expect(gate.check(OWNER, 'c').ok).toBe(true); // past the quota of 2
  });
});
