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
const labelsOf = (r: Reply): string[] =>
  r.kind === 'buttons' ? r.rows.flat().map((b) => b.label) : [];
const editsOf = (r: Reply): boolean | undefined => (r.kind === 'buttons' ? r.edit : undefined);

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
    expect(doc.content).toContain('date,description,amount,currency');
    expect(doc.content).toContain('TOTAL');
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
    await app.setLocation(ref, 33.8886, 35.4955); // Beirut (still works if a location is attached)
    expect(textOf((await app.action(ref, 'settings'))[0]!)).toContain('Asia/Beirut');

    const tzMenu = await app.action(ref, 'tz');
    expect(tzMenu[0]!.kind).toBe('buttons');
    expect(textOf(tzMenu[0]!)).toContain('timezone');
  });

  it('paginates the full currency list and sets a currency from it', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    const page = await app.action(ref, 'cur:page:0');
    expect(page[0]!.kind).toBe('buttons');
    expect(textOf(page[0]!)).toContain('page 1/');
    await app.action(ref, 'cur:SEK');
    expect(textOf((await app.action(ref, 'settings'))[0]!)).toContain('SEK');
  });

  it('paginates a long itemized report', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    for (let i = 0; i < 55; i++) await app.handle(ref, 'coffee 5'); // > 50/page

    const page1 = await app.action(ref, 'report:this-month'); // now = 2026-06-15 → June
    expect(page1[0]!.kind).toBe('buttons');
    expect(textOf(page1[0]!)).toContain('page 1/2');

    const page2 = await app.action(ref, 'rptpage:2026-06-01:2026-06-30:1');
    expect(textOf(page2[0]!)).toContain('page 2/2');
    expect(textOf(page2[0]!)).toContain('Total: $275.00'); // 55 × $5, full-range total on every page
  });

  it('undo removes the just-logged entry', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    const logged = await app.handle(ref, 'coffee 5');
    const undoBtn = (logged[0] as Extract<Reply, { kind: 'buttons' }>).rows
      .flat()
      .find((b) => b.action.startsWith('undo:'));
    expect(undoBtn).toBeDefined();
    await app.action(ref, undoBtn!.action);
    expect(textOf((await app.action(ref, 'report:this-month'))[0]!)).toContain('No expenses');
  });

  it('deletes a specific entry from the delete list', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.handle(ref, 'gas 10');
    await app.handle(ref, 'lunch 20');
    const list = await app.action(ref, 'dellist:2026-06-01:2026-06-30:0');
    const delBtn = (list[0] as Extract<Reply, { kind: 'buttons' }>).rows
      .flat()
      .find((b) => b.action.startsWith('del:'));
    expect(delBtn).toBeDefined();
    await app.action(ref, delBtn!.action);
    const rep = await app.action(ref, 'report:this-month');
    expect(textOf(rep[0]!)).toMatch(/Total: \$(10|20)\.00/);
  });

  it('picks a month from the Jan-to-Dec grid', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient())); // now = 2026-06-15
    await app.handle(ref, 'coffee 5');

    const menu = await app.action(ref, 'report');
    const monthsBtn = (menu[0] as Extract<Reply, { kind: 'buttons' }>).rows
      .flat()
      .find((b) => b.action === 'months:report');
    expect(monthsBtn).toBeDefined();

    const grid = await app.action(ref, 'months:report');
    expect(textOf(grid[0]!)).toContain('2026');
    const labels = (grid[0] as Extract<Reply, { kind: 'buttons' }>).rows.flat().map((b) => b.label);
    expect(labels).toContain('Jan');
    expect(labels).toContain('Dec');

    // June has the expense, May does not
    expect(textOf((await app.action(ref, 'mon:report:2026-06'))[0]!)).toContain('Total: $5.00');
    expect(textOf((await app.action(ref, 'mon:report:2026-05'))[0]!)).toContain('No expenses');

    // year arrows switch the grid
    expect(textOf((await app.action(ref, 'months:report:2025'))[0]!)).toContain('2025');

    // and it exports too
    expect((await app.action(ref, 'mon:export:2026-06'))[0]!.kind).toBe('document');
  });

  it('builds a custom range by tapping two dates on the calendar', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.handle(ref, 'coffee 5');

    const cal = await app.action(ref, 'cal:report');
    expect(cal[0]!.kind).toBe('buttons');
    expect(textOf(cal[0]!)).toContain('Tap the start date');
    expect(labelsOf(cal[0]!)).toContain('June 2026'); // calendar header
    expect(labelsOf(cal[0]!)).toContain('15'); // a tappable day

    const afterStart = await app.action(ref, 'cpick:report:2026-06-10');
    expect(textOf(afterStart[0]!)).toContain('Start: 2026-06-10');
    expect(textOf(afterStart[0]!)).toContain('end date');

    const report = await app.action(ref, 'cpick:report:2026-06-20:2026-06-10');
    expect(textOf(report[0]!)).toContain('2026-06-10 → 2026-06-20');
    expect(textOf(report[0]!)).toContain('Total: $5.00');
  });

  it('swaps the calendar dates when the end is tapped before the start', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.handle(ref, 'coffee 5');
    const report = await app.action(ref, 'cpick:report:2026-06-01:2026-06-20');
    expect(textOf(report[0]!)).toContain('2026-06-01 → 2026-06-20');
  });

  it('calendar month arrows move without losing the chosen start date', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    const next = await app.action(ref, 'cal:report:2026-07:2026-06-10');
    expect(labelsOf(next[0]!)).toContain('July 2026');
    expect(textOf(next[0]!)).toContain('Start: 2026-06-10');

    // blank calendar padding does nothing at all
    expect(await app.action(ref, 'noop')).toEqual([]);
  });

  it('edits the picker in place but sends results as new messages', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.handle(ref, 'coffee 5');

    // opening a picker must NOT edit: the Report button also sits on the
    // "Logged" message, and editing there would destroy it and its Undo
    expect(editsOf((await app.action(ref, 'report'))[0]!)).toBeFalsy();
    expect(editsOf((await app.handle(ref, '/report'))[0]!)).toBeFalsy();

    // navigating inside the picker replaces the panel
    expect(editsOf((await app.action(ref, 'cal:report'))[0]!)).toBe(true);
    expect(editsOf((await app.action(ref, 'cal:report:2026-07'))[0]!)).toBe(true);
    expect(editsOf((await app.action(ref, 'cpick:report:2026-06-10'))[0]!)).toBe(true);
    expect(editsOf((await app.action(ref, 'months:report'))[0]!)).toBe(true);
    expect(editsOf((await app.action(ref, 'months:report:2025'))[0]!)).toBe(true);
    expect(editsOf((await app.action(ref, 'pick:report'))[0]!)).toBe(true);

    // the actual report and export are fresh messages, so they stay in history
    expect(editsOf((await app.action(ref, 'cpick:report:2026-06-20:2026-06-10'))[0]!)).toBeFalsy();
    expect(editsOf((await app.action(ref, 'mon:report:2026-06'))[0]!)).toBeFalsy();
    expect(editsOf((await app.action(ref, 'report:this-month'))[0]!)).toBeFalsy();
  });

  it('edits the currency picker in place while paging A to Z', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));

    // opening it is a fresh message, paging and back replace the panel
    expect(editsOf((await app.action(ref, 'currency'))[0]!)).toBeFalsy();
    expect(editsOf((await app.action(ref, 'cur:page:0'))[0]!)).toBe(true);
    expect(editsOf((await app.action(ref, 'cur:page:1'))[0]!)).toBe(true);

    const back = await app.action(ref, 'cur:menu');
    expect(editsOf(back[0]!)).toBe(true);
    expect(textOf(back[0]!)).toContain('Pick your currency');

    // picking a code collapses the grid into the confirmation
    const picked = await app.action(ref, 'cur:EUR');
    expect(editsOf(picked[0]!)).toBe(true);
    expect(textOf(picked[0]!)).toContain('EUR');
    expect(textOf((await app.action(ref, 'settings'))[0]!)).toContain('EUR');

    // "cur:menu" must not be mistaken for a currency code named MENU
    expect(textOf((await app.action(ref, 'settings'))[0]!)).not.toContain('MENU');
  });

  it('back from a picker returns to the period menu', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    const back = (await app.action(ref, 'cal:report'))[0]!;
    const backBtn = (back as Extract<Reply, { kind: 'buttons' }>).rows
      .flat()
      .find((b) => b.label.includes('Back'));
    expect(backBtn?.action).toBe('pick:report');
    expect(textOf((await app.action(ref, backBtn!.action))[0]!)).toContain('pick a period');
  });

  it('shows /stats to the owner only, and hides it from everyone else', async () => {
    // no owner configured → /stats is indistinguishable from an unknown command
    const noOwner = makeApp(new Parser('rules', new NullLlmClient()));
    await noOwner.handle(ref, 'coffee 5');
    const stranger = await noOwner.handle(ref, '/stats');
    expect(textOf(stranger[0]!)).toContain('Unknown command');
    expect(textOf(stranger[0]!)).not.toContain('Total users');

    // owner configured → owner sees the numbers, a different user does not
    const db = openDb(':memory:');
    migrate(db);
    const users = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
    const expenses = new ExpensesRepo(db);
    const pending = new PendingRepo(db);
    const capture = new CaptureService(db, pending, expenses);
    const fx = new FxService(new FxRatesRepo(db), new StaticFxProvider({}));
    const ownerRef: UserRef = { platform: 'telegram', platformUserId: 'owner-1' };
    const app = new App({
      db,
      users,
      expenses,
      capture,
      parser: new Parser('rules', new NullLlmClient()),
      fx,
      now,
      ownerRef,
    });

    await app.handle(ownerRef, 'coffee 5');
    const stats = await app.handle(ownerRef, '/stats');
    expect(textOf(stats[0]!)).toContain('Total users: 1');
    expect(textOf(stats[0]!)).toContain('Expenses logged: 1');

    const otherRef: UserRef = { platform: 'telegram', platformUserId: 'someone-else' };
    const denied = await app.handle(otherRef, '/stats');
    expect(textOf(denied[0]!)).toContain('Unknown command');
    expect(textOf(denied[0]!)).not.toContain('Total users');
  });

  it('supports year periods and a custom-range prompt', async () => {
    const app = makeApp(new Parser('rules', new NullLlmClient()));
    await app.handle(ref, 'coffee 5'); // now = 2026-06-15

    expect(textOf((await app.action(ref, 'report:this-year'))[0]!)).toContain('Total: $5.00');
    expect(textOf((await app.action(ref, 'report:last-year'))[0]!)).toContain('No expenses');
    expect(textOf((await app.action(ref, 'custom:report'))[0]!)).toContain('/report');
  });
});
