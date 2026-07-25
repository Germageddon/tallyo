import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/storage/db';
import { migrate } from '../../src/storage/migrate';
import { UsersRepo } from '../../src/storage/users-repo';
import { ExpensesRepo } from '../../src/storage/expenses-repo';
import { PendingRepo } from '../../src/storage/pending-repo';
import { CaptureService } from '../../src/capture/capture-service';
import { FxRatesRepo } from '../../src/storage/fx-rates-repo';
import { FxService } from '../../src/fx/fx-service';
import { StaticFxProvider } from '../../src/fx/provider';
import { Parser } from '../../src/parser/parser';
import { MockLlmClient } from '../../src/parser/llm-client';
import { NullLlmClient } from '../../src/parser/null-llm';
import { AccessRepo } from '../../src/storage/access-repo';
import { UsageRepo } from '../../src/storage/usage-repo';
import { RateLimiter } from '../../src/safety/rate-limiter';
import { Gate } from '../../src/safety/gate';
import { App } from '../../src/app/app';
import type { Reply, UserRef } from '../../src/app/types';

const ref: UserRef = { platform: 'cli', platformUserId: 'u1' };
const now = () => new Date('2026-06-15T12:00:00Z');

function makeApp(parser: Parser): App {
  const db = openDb(':memory:');
  migrate(db);
  const users = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
  const expenses = new ExpensesRepo(db);
  const pending = new PendingRepo(db);
  const capture = new CaptureService(db, pending, expenses);
  const fx = new FxService(new FxRatesRepo(db), new StaticFxProvider({ '2026-06-15': { EUR: '0.9' } }));
  return new App({ db, users, expenses, capture, parser, fx, now });
}

const textOf = (r: Reply): string => ('text' in r ? r.text : '');

describe('App end-to-end', () => {
  it('auto-logs a high-confidence expense and reports the total', async () => {
    const app = makeApp(new Parser('auto', new NullLlmClient()));
    const logged = await app.handle(ref, 'coffee 5, gas 10');
    expect(textOf(logged[0]!)).toContain('Logged');

    const report = await app.handle(ref, '/report this month');
    expect(textOf(report[0]!)).toContain('Total: $15.00');
  });

  it('handles unparseable input gracefully', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    const r = await app.handle(ref, 'hello there');
    expect(textOf(r[0]!).toLowerCase()).toContain("couldn't");
  });

  it('requires confirmation for a low-confidence (LLM) capture', async () => {
    const mock = new MockLlmClient([
      { amount: '15', currency: null, category: 'Food', description: 'lunch', dateHint: null },
    ]);
    const app = makeApp(new Parser('llm', mock));

    const first = await app.handle(ref, 'grabbed lunch, about 15');
    expect(first[0]!.kind).toBe('confirm');
    const captureId = (first[0] as Extract<Reply, { kind: 'confirm' }>).captureId;

    const before = await app.handle(ref, '/report this month');
    expect(textOf(before[0]!)).toContain('No expenses');

    const saved = await app.confirm(ref, captureId);
    expect(textOf(saved[0]!)).toContain('Saved');

    const after = await app.handle(ref, '/report this month');
    expect(textOf(after[0]!)).toContain('Total: $15.00');
  });

  it('exports a CSV document', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.handle(ref, 'coffee 5');
    const r = await app.handle(ref, '/export this month');
    expect(r[0]!.kind).toBe('document');
    const doc = r[0] as Extract<Reply, { kind: 'document' }>;
    expect(doc.content).toContain('date,category,description,amount,currency');
    expect(doc.filename).toContain('.csv');
  });

  it('blocks a non-allowlisted user, then allows them after /approve', async () => {
    const db = openDb(':memory:');
    migrate(db);
    const users = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
    const expenses = new ExpensesRepo(db);
    const pending = new PendingRepo(db);
    const capture = new CaptureService(db, pending, expenses);
    const fx = new FxService(new FxRatesRepo(db), new StaticFxProvider({}));
    const access = new AccessRepo(db);
    const limiter = new RateLimiter(100, 60_000, () => 0);
    const gate = new Gate(
      access,
      new UsageRepo(db),
      limiter,
      { accessMode: 'allowlist', maxInputChars: 500, dailyMsgQuota: 100 },
      now,
    );
    const app = new App({
      db,
      users,
      expenses,
      capture,
      parser: new Parser('rules', new NullLlmClient()),
      fx,
      now,
      gate,
      access,
    });

    const denied = await app.handle(ref, 'coffee 5');
    expect(textOf(denied[0]!).toLowerCase()).toContain('private');

    access.approve(ref.platform, ref.platformUserId, 'owner');
    const allowed = await app.handle(ref, 'coffee 5');
    expect(textOf(allowed[0]!)).toContain('Logged');
  });

  it('sets currency and timezone deterministically', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.handle(ref, '/currency EUR');
    await app.handle(ref, '/timezone Europe/Berlin');
    const settings = await app.handle(ref, '/settings');
    expect(textOf(settings[0]!)).toContain('EUR');
    expect(textOf(settings[0]!)).toContain('Europe/Berlin');

    const bad = await app.handle(ref, '/timezone Nowhere/Fake');
    expect(textOf(bad[0]!)).toContain('Usage');
  });

  it('routes button actions: report period, currency, timezone, menu', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.handle(ref, 'coffee 5');

    const rep = await app.action(ref, 'report:this-month');
    expect(textOf(rep[0]!)).toContain('Total: $5.00');

    await app.action(ref, 'cur:EUR');
    expect(textOf((await app.action(ref, 'settings'))[0]!)).toContain('EUR');

    await app.action(ref, 'tz:Asia/Beirut');
    expect(textOf((await app.action(ref, 'settings'))[0]!)).toContain('Asia/Beirut');

    expect((await app.action(ref, 'menu'))[0]!.kind).toBe('buttons');
  });

  it('auto-detects timezone from a shared location', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.setLocation(ref, 33.8886, 35.4955); // Beirut
    expect(textOf((await app.action(ref, 'settings'))[0]!)).toContain('Asia/Beirut');

    const tzMenu = await app.action(ref, 'tz');
    expect(tzMenu.some((r) => r.kind === 'request-location')).toBe(true);
  });
});
