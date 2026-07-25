import { Money } from '../domain/money';
import type { Parser } from '../parser/parser';
import type { LineItem } from '../parser/types';
import type { FxService } from '../fx/fx-service';
import type { UsersRepo, UserRow } from '../storage/users-repo';
import type { ExpensesRepo } from '../storage/expenses-repo';
import type { CaptureService } from '../capture/capture-service';
import { buildReport } from '../reporting/report';
import { toCsv } from '../export/csv';
import { parseRange } from './report-range';
import type { Reply, UserRef } from './types';

export type AppDeps = {
  users: UsersRepo;
  expenses: ExpensesRepo;
  capture: CaptureService;
  parser: Parser;
  fx: FxService;
  now: () => Date;
};

const HELP =
  'Text me an expense in plain language:\n' +
  '  `coffee 5, gas 10`\n' +
  '  `spent $20 on groceries`\n\n' +
  'Commands:\n' +
  '  /report [last month | this month | today | YYYY-MM-DD YYYY-MM-DD]\n' +
  '  /export [same ranges]\n' +
  '  /settings — show your currency & timezone\n' +
  '  yes / no — confirm or cancel a pending entry';

export class App {
  constructor(private readonly d: AppDeps) {}

  async handle(ref: UserRef, text: string): Promise<Reply[]> {
    const userId = this.d.users.upsert(ref.platform, ref.platformUserId);
    const user = this.d.users.getById(userId)!;
    const trimmed = text.trim();
    if (trimmed.startsWith('/')) return this.command(userId, user, trimmed);
    return this.logExpense(userId, user, trimmed);
  }

  async confirm(ref: UserRef, captureId: number): Promise<Reply[]> {
    const userId = this.d.users.upsert(ref.platform, ref.platformUserId);
    const res = this.d.capture.confirm(userId, captureId);
    if (res.kind === 'gone') return [{ kind: 'text', text: 'That entry was already handled.' }];
    return [{ kind: 'text', text: 'Saved. ✅' }];
  }

  async cancel(ref: UserRef, captureId: number): Promise<Reply[]> {
    const userId = this.d.users.upsert(ref.platform, ref.platformUserId);
    this.d.capture.cancel(userId, captureId);
    return [{ kind: 'text', text: 'Cancelled — nothing saved.' }];
  }

  private async logExpense(userId: number, user: UserRow, text: string): Promise<Reply[]> {
    if (!text) return [{ kind: 'text', text: HELP }];

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
      return [{ kind: 'text', text: `Logged ${summarize(items)}.` }];
    }
    // res.kind === 'confirm'
    return [
      { kind: 'confirm', captureId: res.captureId, text: `Got:\n${summarize(items)}\nConfirm? (yes / no)` },
    ];
  }

  private async command(userId: number, user: UserRow, text: string): Promise<Reply[]> {
    const [cmd, ...rest] = text.split(/\s+/);
    const arg = rest.join(' ');
    switch (cmd) {
      case '/start':
      case '/help':
        return [{ kind: 'text', text: HELP }];
      case '/settings':
        return [
          {
            kind: 'text',
            text:
              `Default currency: ${user.defaultCurrency}\n` +
              `Display currency: ${user.displayCurrency}\n` +
              `Timezone: ${user.timezone}`,
          },
        ];
      case '/report':
        return this.report(userId, user, arg);
      case '/export':
        return this.export(userId, user, arg);
      default:
        return [{ kind: 'text', text: `Unknown command. ${HELP}` }];
    }
  }

  private async report(userId: number, user: UserRow, arg: string): Promise<Reply[]> {
    const range = parseRange(arg, user.timezone, this.d.now());
    if (!range) return [{ kind: 'text', text: 'Usage: /report [last month | this month | today | YYYY-MM-DD YYYY-MM-DD]' }];
    const rows = this.d.expenses.listByRange(userId, range.from, range.to);
    if (rows.length === 0) return [{ kind: 'text', text: `No expenses between ${range.from} and ${range.to}.` }];

    const report = await buildReport(rows, user.displayCurrency, this.d.fx);
    const lines = report.byCategory.map(
      (c) => `  ${c.category}: ${Money.ofMinor(c.amountMinor, report.targetCurrency).format()}`,
    );
    const total = Money.ofMinor(report.totalMinor, report.targetCurrency).format();
    return [
      {
        kind: 'text',
        text: `Spending ${range.from}…${range.to} (${report.targetCurrency}):\n${lines.join('\n')}\nTotal: ${total}`,
      },
    ];
  }

  private async export(userId: number, user: UserRow, arg: string): Promise<Reply[]> {
    const range = parseRange(arg, user.timezone, this.d.now());
    if (!range) return [{ kind: 'text', text: 'Usage: /export [last month | this month | today | YYYY-MM-DD YYYY-MM-DD]' }];
    const rows = this.d.expenses.listByRange(userId, range.from, range.to);
    if (rows.length === 0) return [{ kind: 'text', text: `No expenses between ${range.from} and ${range.to}.` }];

    return [
      {
        kind: 'document',
        filename: `expenses-${range.from}_${range.to}.csv`,
        content: toCsv(rows),
        caption: `${rows.length} expenses, ${range.from}…${range.to}`,
      },
    ];
  }
}

function summarize(items: LineItem[]): string {
  return items
    .map((i) => `${i.category} ${Money.ofMinor(i.amountMinor, i.currency).format()} (${i.description})`)
    .join(', ');
}
