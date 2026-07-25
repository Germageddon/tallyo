import type { Db } from './db';
import type { LineItem } from '../parser/types';

export type PendingCapture = {
  id: number;
  items: LineItem[];
  state: string;
};

export class PendingRepo {
  constructor(private readonly db: Db) {}

  create(userId: number, items: LineItem[], state: string, expiresAt: string): number {
    const now = new Date().toISOString();
    const info = this.db
      .prepare(
        `INSERT INTO pending_captures
           (user_id, parsed_json, status, state, created_at, expires_at)
         VALUES (?, ?, 'pending', ?, ?, ?)`,
      )
      .run(userId, JSON.stringify(items), state, now, expiresAt);
    return Number(info.lastInsertRowid);
  }

  getPending(userId: number, id: number): PendingCapture | undefined {
    const row = this.db
      .prepare(
        `SELECT id, parsed_json, state FROM pending_captures
         WHERE id = ? AND user_id = ? AND status = 'pending'`,
      )
      .get(id, userId);
    if (!row) return undefined;
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      items: JSON.parse(r.parsed_json as string) as LineItem[],
      state: r.state as string,
    };
  }

  markCommitted(userId: number, id: number): boolean {
    const info = this.db
      .prepare(
        `UPDATE pending_captures SET status = 'committed'
         WHERE id = ? AND user_id = ? AND status = 'pending'`,
      )
      .run(id, userId);
    return info.changes > 0;
  }

  markCancelled(userId: number, id: number): boolean {
    const info = this.db
      .prepare(
        `UPDATE pending_captures SET status = 'cancelled'
         WHERE id = ? AND user_id = ? AND status = 'pending'`,
      )
      .run(id, userId);
    return info.changes > 0;
  }
}
