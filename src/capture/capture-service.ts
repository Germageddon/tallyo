import type { Db } from '../storage/db';
import type { PendingRepo } from '../storage/pending-repo';
import type { ExpensesRepo } from '../storage/expenses-repo';
import type { LineItem, ParseOutcome } from '../parser/types';

export type SubmitResult =
  | { kind: 'saved'; ids: number[] }
  | { kind: 'confirm'; captureId: number; items: LineItem[] }
  | { kind: 'rejected'; reason: string };

export type ConfirmResult = { kind: 'saved'; ids: number[] } | { kind: 'gone' };

export class CaptureService {
  constructor(
    private readonly db: Db,
    private readonly pending: PendingRepo,
    private readonly expenses: ExpensesRepo,
  ) {}

  submit(
    userId: number,
    outcome: ParseOutcome,
    opts: { autoAcceptHigh: boolean; expiresAt: string },
  ): SubmitResult {
    if (!outcome.ok) {
      return { kind: 'rejected', reason: outcome.reason };
    }

    if (outcome.confidence === 'high' && opts.autoAcceptHigh) {
      const ids = outcome.items.map((item) => this.expenses.insert(userId, item));
      return { kind: 'saved', ids };
    }

    const captureId = this.pending.create(
      userId,
      outcome.items,
      'AWAITING_CONFIRM',
      opts.expiresAt,
    );
    return { kind: 'confirm', captureId, items: outcome.items };
  }

  confirm(userId: number, captureId: number): ConfirmResult {
    return this.db.transaction((): ConfirmResult => {
      const p = this.pending.getPending(userId, captureId);
      if (!p) return { kind: 'gone' };
      if (!this.pending.markCommitted(userId, captureId)) return { kind: 'gone' };
      const ids = p.items.map((item) => this.expenses.insert(userId, item));
      return { kind: 'saved', ids };
    })();
  }

  cancel(userId: number, captureId: number): boolean {
    return this.pending.markCancelled(userId, captureId);
  }
}
