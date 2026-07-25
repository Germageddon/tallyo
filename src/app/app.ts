import { Money } from '../domain/money';
import type { Db } from '../storage/db';
import type { Parser } from '../parser/parser';
import type { LineItem } from '../parser/types';
import type { FxService } from '../fx/fx-service';
import type { UsersRepo, UserRow } from '../storage/users-repo';
import type { ExpensesRepo } from '../storage/expenses-repo';
import type { CaptureService } from '../capture/capture-service';
import type { AccessRepo } from '../storage/access-repo';
import type { Gate } from '../safety/gate';
import { buildReport } from '../reporting/report';
import { toCsv } from '../export/csv';
import { parseRange, periodRange, PERIODS, type DateRange } from './report-range';
import { timezoneFromCoords } from './geo';
import { ALL_CURRENCIES, COMMON_CURRENCIES } from '../domain/currency-list';
import type { Button, Reply, UserRef } from './types';

export type AppDeps = {
  db: Db;
  users: UsersRepo;
  expenses: ExpensesRepo;
  capture: CaptureService;
  parser: Parser;
  fx: FxService;
  now: () => Date;
  gate?: Gate;
  access?: AccessRepo;
  ownerRef?: UserRef;
};

const HELP =
  'Just type an expense in plain language — I do the rest:\n' +
  '  `coffee 5, gas 10`\n' +
  '  `spent $20 on groceries`\n\n' +
  'For everything else, tap the buttons (or send /start to open the menu).';

// Timezone picker: a curated set of common cities covering most users.
const CITY_TZS: { label: string; tz: string }[] = [
  { label: 'London', tz: 'Europe/London' },
  { label: 'Berlin', tz: 'Europe/Berlin' },
  { label: 'Moscow', tz: 'Europe/Moscow' },
  { label: 'Beirut', tz: 'Asia/Beirut' },
  { label: 'Cairo', tz: 'Africa/Cairo' },
  { label: 'Dubai', tz: 'Asia/Dubai' },
  { label: 'Karachi', tz: 'Asia/Karachi' },
  { label: 'India', tz: 'Asia/Kolkata' },
  { label: 'Bangkok', tz: 'Asia/Bangkok' },
  { label: 'Shanghai', tz: 'Asia/Shanghai' },
  { label: 'Tokyo', tz: 'Asia/Tokyo' },
  { label: 'Sydney', tz: 'Australia/Sydney' },
  { label: 'New York', tz: 'America/New_York' },
  { label: 'Chicago', tz: 'America/Chicago' },
  { label: 'Los Angeles', tz: 'America/Los_Angeles' },
  { label: 'UTC', tz: 'UTC' },
];

export class App {
  constructor(private readonly d: AppDeps) {}

  // ---- entry points -------------------------------------------------------

  /** A typed message (an expense, or a slash-command). */
  async handle(ref: UserRef, text: string): Promise<Reply[]> {
    if (this.d.gate) {
      const gated = this.d.gate.check(ref, text);
      if (!gated.ok) return [{ kind: 'text', text: gated.reply }];
    }
    const { userId, user } = this.load(ref);
    const trimmed = text.trim();
    if (trimmed.startsWith('/')) return this.command(ref, userId, user, trimmed);
    return this.logExpense(userId, user, trimmed);
  }

  /** A button tap. `data` is the button's action string. */
  async action(ref: UserRef, data: string): Promise<Reply[]> {
    if (this.d.gate) {
      const gated = this.d.gate.check(ref, '');
      if (!gated.ok) return [{ kind: 'text', text: gated.reply }];
    }
    const { userId, user } = this.load(ref);

    if (data === 'menu') return [this.menu()];
    if (data === 'help') return [{ kind: 'text', text: HELP }];
    if (data === 'report') return [this.periodMenu('report', 'Report — pick a period:')];
    if (data === 'export') return [this.periodMenu('export', 'Export — pick a period:')];
    if (data === 'currency') return [this.currencyMenu()];
    if (data === 'settings') return [this.settingsReply(user)];

    if (data.startsWith('report:')) return this.reportForRange(userId, user, this.rangeFromToken(user, data.slice(7)));
    if (data.startsWith('export:')) return this.exportForRange(userId, this.rangeFromToken(user, data.slice(7)));
    if (data === 'tz') return this.timezoneMenu();
    if (data.startsWith('tz:')) return this.setTz(userId, data.slice(3));
    if (data.startsWith('cur:page:')) return [this.currencyPage(Number(data.slice(9)))];
    if (data.startsWith('cur:')) return this.pickCurrency(userId, data.slice(4));
    if (data.startsWith('confirm:')) return this.confirm(ref, Number(data.slice(8)));
    if (data.startsWith('cancel:')) return this.cancel(ref, Number(data.slice(7)));
    if (data === 'forget') return this.forget(userId, '');
    if (data === 'forget:confirm') return this.doForget(userId);

    return [this.menu()];
  }

  async confirm(ref: UserRef, captureId: number): Promise<Reply[]> {
    const userId = this.d.users.upsert(ref.platform, ref.platformUserId);
    const res = this.d.capture.confirm(userId, captureId);
    if (res.kind === 'gone') return [{ kind: 'text', text: 'That entry was already handled.' }];
    return [{ kind: 'buttons', text: 'Saved ✅', rows: MAIN_MENU }];
  }

  async cancel(ref: UserRef, captureId: number): Promise<Reply[]> {
    const userId = this.d.users.upsert(ref.platform, ref.platformUserId);
    this.d.capture.cancel(userId, captureId);
    return [{ kind: 'text', text: 'Cancelled — nothing saved.' }];
  }

  /** A shared location → timezone (auto-detect). */
  async setLocation(ref: UserRef, lat: number, lng: number): Promise<Reply[]> {
    const { userId } = this.load(ref);
    let tz: string;
    try {
      tz = timezoneFromCoords(lat, lng);
    } catch {
      return [{ kind: 'text', text: "Couldn't read that location — pick a city from the list instead." }];
    }
    this.d.users.updateSettings(userId, { timezone: tz });
    return [{ kind: 'buttons', text: `Timezone set to ${tz} ✅ (from your location)`, rows: MAIN_MENU }];
  }

  // ---- menus --------------------------------------------------------------

  private menu(): Reply {
    return {
      kind: 'buttons',
      text: 'What would you like to do?\n\n(To log an expense, just type it — e.g. “coffee 5, gas 10”.)',
      rows: MAIN_MENU,
    };
  }

  private periodMenu(kind: 'report' | 'export', title: string): Reply {
    const rows: Button[][] = [];
    for (let i = 0; i < PERIODS.length; i += 2) {
      rows.push(
        PERIODS.slice(i, i + 2).map((p) => ({ label: p.label, action: `${kind}:${p.key}` })),
      );
    }
    rows.push([{ label: '⬅️ Menu', action: 'menu' }]);
    return { kind: 'buttons', text: title, rows };
  }

  private currencyMenu(): Reply {
    const rows: Button[][] = [];
    for (let i = 0; i < COMMON_CURRENCIES.length; i += 3) {
      rows.push(COMMON_CURRENCIES.slice(i, i + 3).map((c) => ({ label: c, action: `cur:${c}` })));
    }
    rows.push([{ label: '🌍 All currencies (A–Z)', action: 'cur:page:0' }]);
    rows.push([{ label: '⬅️ Menu', action: 'menu' }]);
    return { kind: 'buttons', text: 'Pick your currency:', rows };
  }

  private currencyPage(page: number): Reply {
    const PER_PAGE = 24;
    const COLS = 4;
    const pageCount = Math.ceil(ALL_CURRENCIES.length / PER_PAGE);
    const p = Math.max(0, Math.min(page, pageCount - 1));
    const slice = ALL_CURRENCIES.slice(p * PER_PAGE, p * PER_PAGE + PER_PAGE);

    const rows: Button[][] = [];
    for (let i = 0; i < slice.length; i += COLS) {
      rows.push(slice.slice(i, i + COLS).map((c) => ({ label: c.code, action: `cur:${c.code}` })));
    }
    const nav: Button[] = [];
    if (p > 0) nav.push({ label: '◀ Prev', action: `cur:page:${p - 1}` });
    nav.push({ label: '⬅️ Menu', action: 'menu' });
    if (p < pageCount - 1) nav.push({ label: 'Next ▶', action: `cur:page:${p + 1}` });
    rows.push(nav);

    return { kind: 'buttons', text: `All currencies — page ${p + 1}/${pageCount}:`, rows };
  }

  private timezoneMenu(): Reply[] {
    const rows: Button[][] = [];
    for (let i = 0; i < CITY_TZS.length; i += 3) {
      rows.push(CITY_TZS.slice(i, i + 3).map((c) => ({ label: c.label, action: `tz:${c.tz}` })));
    }
    rows.push([{ label: '⬅️ Menu', action: 'menu' }]);
    return [
      {
        kind: 'buttons',
        text: '🕐 Pick your timezone — or tap 📍 below to detect it from your location:',
        rows,
      },
      { kind: 'request-location', text: 'Tap to share your location 👇' },
    ];
  }

  private setTz(userId: number, tz: string): Reply[] {
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    } catch {
      return [this.menu()];
    }
    this.d.users.updateSettings(userId, { timezone: tz });
    return [{ kind: 'buttons', text: `Timezone set to ${tz} ✅`, rows: MAIN_MENU }];
  }

  private settingsReply(user: UserRow): Reply {
    return {
      kind: 'buttons',
      text: `Your currency: ${user.displayCurrency}\nYour timezone: ${user.timezone}`,
      rows: [
        [{ label: '💱 Change currency', action: 'currency' }],
        [{ label: '🕐 Change timezone', action: 'tz' }],
        [{ label: '🗑 Delete my data', action: 'forget' }],
        [{ label: '⬅️ Menu', action: 'menu' }],
      ],
    };
  }

  // ---- actions ------------------------------------------------------------

  private pickCurrency(userId: number, code: string): Reply[] {
    if (code === 'other') {
      return [{ kind: 'text', text: 'Send me a 3-letter code — e.g. `/currency SEK`.' }];
    }
    const c = code.toUpperCase();
    this.d.users.updateSettings(userId, { defaultCurrency: c, displayCurrency: c });
    return [{ kind: 'buttons', text: `Currency set to ${c} ✅`, rows: MAIN_MENU }];
  }

  private rangeFromToken(user: UserRow, token: string): DateRange | null {
    const explicit = token.match(/^(\d{4}-\d{2}-\d{2}):(\d{4}-\d{2}-\d{2})$/);
    if (explicit) return { from: explicit[1]!, to: explicit[2]! };
    return periodRange(token, user.timezone, this.d.now());
  }

  private async reportForRange(userId: number, user: UserRow, range: DateRange | null): Promise<Reply[]> {
    if (!range) return [this.menu()];
    const rows = this.d.expenses.listByRange(userId, range.from, range.to);
    if (rows.length === 0) {
      return [
        {
          kind: 'buttons',
          text: `No expenses ${range.from} … ${range.to}.`,
          rows: [[{ label: '⬅️ Menu', action: 'menu' }]],
        },
      ];
    }
    const report = await buildReport(rows, user.displayCurrency, this.d.fx);
    const lines = report.byCategory.map(
      (c) => `  ${c.category}: ${Money.ofMinor(c.amountMinor, report.targetCurrency).format()}`,
    );
    const total = Money.ofMinor(report.totalMinor, report.targetCurrency).format();
    return [
      {
        kind: 'buttons',
        text: `📊 ${range.from} … ${range.to} (${report.targetCurrency})\n${lines.join('\n')}\n\nTotal: ${total}`,
        rows: [
          [
            { label: '📤 Export this', action: `export:${range.from}:${range.to}` },
            { label: '⬅️ Menu', action: 'menu' },
          ],
        ],
      },
    ];
  }

  private async exportForRange(userId: number, range: DateRange | null): Promise<Reply[]> {
    if (!range) return [this.menu()];
    const rows = this.d.expenses.listByRange(userId, range.from, range.to);
    if (rows.length === 0) {
      return [
        {
          kind: 'buttons',
          text: `No expenses ${range.from} … ${range.to}.`,
          rows: [[{ label: '⬅️ Menu', action: 'menu' }]],
        },
      ];
    }
    return [
      {
        kind: 'document',
        filename: `expenses-${range.from}_${range.to}.csv`,
        content: toCsv(rows),
        caption: `${rows.length} expenses, ${range.from} … ${range.to}`,
      },
    ];
  }

  // ---- typed commands (still supported) -----------------------------------

  private async command(ref: UserRef, userId: number, user: UserRow, text: string): Promise<Reply[]> {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case '/start':
      case '/menu':
        return [this.menu()];
      case '/help':
        return [{ kind: 'text', text: HELP }];
      case '/settings':
        return [this.settingsReply(user)];
      case '/currency':
        if (!arg) return [this.currencyMenu()];
        return this.setCurrencyTyped(userId, arg);
      case '/timezone': // kept for power users; not surfaced in the UI
        return this.setTimezone(userId, arg);
      case '/report':
        if (!arg) return [this.periodMenu('report', 'Report — pick a period:')];
        return this.reportForRange(userId, user, parseRange(arg, user.timezone, this.d.now()));
      case '/export':
        if (!arg) return [this.periodMenu('export', 'Export — pick a period:')];
        return this.exportForRange(userId, parseRange(arg, user.timezone, this.d.now()));
      case '/forget':
        return this.forget(userId, arg);
      case '/approve':
        return this.ownerAccess(ref, arg, 'approve');
      case '/revoke':
        return this.ownerAccess(ref, arg, 'revoke');
      default:
        return [{ kind: 'text', text: `Unknown command.\n\n${HELP}` }];
    }
  }

  private async logExpense(userId: number, user: UserRow, text: string): Promise<Reply[]> {
    if (!text) return [this.menu()];

    const ctx = { defaultCurrency: user.defaultCurrency, timezone: user.timezone, now: this.d.now() };
    let outcome;
    try {
      outcome = await this.d.parser.parse(text, ctx);
    } catch {
      return [{ kind: 'text', text: "I couldn't read that. Try: `coffee 5, gas 10`." }];
    }
    if (!outcome.ok) {
      return [{ kind: 'text', text: "I couldn't find an amount. Try: `coffee 5`." }];
    }

    const items = outcome.items;
    const expiresAt = new Date(this.d.now().getTime() + 24 * 3600 * 1000).toISOString();
    const res = this.d.capture.submit(userId, outcome, { autoAcceptHigh: true, expiresAt });

    if (res.kind === 'rejected') {
      return [{ kind: 'text', text: "I couldn't find an amount. Try: `coffee 5`." }];
    }
    if (res.kind === 'saved') {
      return [{ kind: 'buttons', text: `Logged ${summarize(items)}.`, rows: [[{ label: '📊 Report', action: 'report' }, { label: '⬅️ Menu', action: 'menu' }]] }];
    }
    return [
      { kind: 'confirm', captureId: res.captureId, text: `Got:\n${summarize(items)}\nConfirm?` },
    ];
  }

  private async setCurrencyTyped(userId: number, arg: string): Promise<Reply[]> {
    const code = arg.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(code)) return [{ kind: 'text', text: 'Usage: /currency USD' }];
    this.d.users.updateSettings(userId, { defaultCurrency: code, displayCurrency: code });
    return [{ kind: 'buttons', text: `Currency set to ${code} ✅`, rows: MAIN_MENU }];
  }

  private async setTimezone(userId: number, arg: string): Promise<Reply[]> {
    const tz = arg.trim();
    try {
      new Intl.DateTimeFormat('en-CA', { timeZone: tz });
    } catch {
      return [{ kind: 'text', text: 'Usage: /timezone Europe/Berlin (an IANA time zone)' }];
    }
    this.d.users.updateSettings(userId, { timezone: tz });
    return [{ kind: 'text', text: `Timezone set to ${tz}.` }];
  }

  private async forget(userId: number, arg: string): Promise<Reply[]> {
    if (arg.trim().toLowerCase() === 'confirm') return this.doForget(userId);
    return [
      {
        kind: 'buttons',
        text: 'This permanently deletes ALL your expenses. Are you sure?',
        rows: [
          [{ label: '🗑 Yes, delete everything', action: 'forget:confirm' }],
          [{ label: '⬅️ Cancel', action: 'menu' }],
        ],
      },
    ];
  }

  private doForget(userId: number): Reply[] {
    const run = this.d.db.transaction(() => {
      this.d.db.prepare('DELETE FROM expenses WHERE user_id = ?').run(userId);
      this.d.db.prepare('DELETE FROM pending_captures WHERE user_id = ?').run(userId);
    });
    run();
    return [{ kind: 'buttons', text: 'Done — all your data has been deleted.', rows: MAIN_MENU }];
  }

  private async ownerAccess(ref: UserRef, arg: string, act: 'approve' | 'revoke'): Promise<Reply[]> {
    if (!this.d.access || !this.isOwner(ref)) return [{ kind: 'text', text: 'Not available.' }];
    const target = arg.trim();
    if (!target) return [{ kind: 'text', text: `Usage: /${act} <user id>` }];
    if (act === 'approve') {
      this.d.access.approve(ref.platform, target, ref.platformUserId);
      return [{ kind: 'text', text: `Approved ${target}.` }];
    }
    this.d.access.revoke(ref.platform, target);
    return [{ kind: 'text', text: `Revoked ${target}.` }];
  }

  // ---- helpers ------------------------------------------------------------

  private load(ref: UserRef): { userId: number; user: UserRow } {
    const userId = this.d.users.upsert(ref.platform, ref.platformUserId);
    return { userId, user: this.d.users.getById(userId)! };
  }

  private isOwner(ref: UserRef): boolean {
    const o = this.d.ownerRef;
    return !!o && o.platform === ref.platform && o.platformUserId === ref.platformUserId;
  }
}

const MAIN_MENU: Button[][] = [
  [
    { label: '📊 Report', action: 'report' },
    { label: '📤 Export', action: 'export' },
  ],
  [
    { label: '💱 Currency', action: 'currency' },
    { label: '⚙️ Settings', action: 'settings' },
  ],
];

function summarize(items: LineItem[]): string {
  return items
    .map((i) => `${i.category} ${Money.ofMinor(i.amountMinor, i.currency).format()} (${i.description})`)
    .join(', ');
}
