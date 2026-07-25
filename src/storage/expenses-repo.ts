import type { Db } from './db';

export type NewExpense = {
  amountMinor: number;
  currency: string;
  category: string;
  description: string;
  spentOn: string; // YYYY-MM-DD
};

export type ExpenseRow = NewExpense & { id: number; userId: number; createdAt: string };

export class ExpensesRepo {
  constructor(private readonly db: Db) {}

  insert(userId: number, e: NewExpense): number {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO expenses
           (user_id, amount_minor, currency, category, description, spent_on, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(userId, e.amountMinor, e.currency, e.category, e.description, e.spentOn, now);
    return Number(info.lastInsertRowid);
  }

  listByRange(userId: number, fromDate: string, toDate: string): ExpenseRow[] {
    const rows = this.db
      .prepare(
        `SELECT * FROM expenses
         WHERE user_id = ? AND deleted_at IS NULL AND spent_on BETWEEN ? AND ?
         ORDER BY spent_on ASC, id ASC`,
      )
      .all(userId, fromDate, toDate);
    return rows.map((row) => {
      const r = row as Record<string, unknown>;
      return {
        id: r.id as number,
        userId: r.user_id as number,
        amountMinor: r.amount_minor as number,
        currency: r.currency as string,
        category: r.category as string,
        description: r.description as string,
        spentOn: r.spent_on as string,
        createdAt: r.created_at as string,
      };
    });
  }

  softDelete(userId: number, id: number): boolean {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `UPDATE expenses SET deleted_at = ?
         WHERE id = ? AND user_id = ? AND deleted_at IS NULL`,
      )
      .run(now, id, userId);
    return info.changes > 0;
  }
}
