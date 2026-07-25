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
  return new App({ users, expenses, capture, parser, fx, now });
}

const textOf = (r: Reply): string => (r.kind === 'text' || r.kind === 'confirm' ? r.text : '');

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
});
