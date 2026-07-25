import type { Db } from './db';

export type UsageField = 'msg_count' | 'llm_calls' | 'tokens';

export type UsageCounts = { msgCount: number; llmCalls: number; tokens: number };

// Whitelist mapping the fixed union to a literal column name so the field can
// never be interpolated from an arbitrary string (SQL injection guard).
const COLUMN: Record<UsageField, UsageField> = {
  msg_count: 'msg_count',
  llm_calls: 'llm_calls',
  tokens: 'tokens',
};

export class UsageRepo {
  constructor(private readonly db: Db) {}

  increment(
    platform: string,
    platformUserId: string,
    day: string,
    field: UsageField,
    by = 1,
  ): void {
    const col = COLUMN[field];
    this.db
      .prepare(
        `INSERT INTO usage (platform, platform_user_id, day, ${col})
         VALUES (?, ?, ?, ?)
         ON CONFLICT (platform, platform_user_id, day)
         DO UPDATE SET ${col} = ${col} + excluded.${col}`,
      )
      .run(platform, platformUserId, day, by);
  }

  get(platform: string, platformUserId: string, day: string): UsageCounts {
    const row = this.db
      .prepare(
        `SELECT msg_count, llm_calls, tokens FROM usage
         WHERE platform = ? AND platform_user_id = ? AND day = ?`,
      )
      .get(platform, platformUserId, day) as
      | { msg_count: number; llm_calls: number; tokens: number }
      | undefined;
    return {
      msgCount: row?.msg_count ?? 0,
      llmCalls: row?.llm_calls ?? 0,
      tokens: row?.tokens ?? 0,
    };
  }

  globalDayTotal(day: string, field: UsageField): number {
    const col = COLUMN[field];
    const row = this.db
      .prepare(`SELECT COALESCE(SUM(${col}), 0) AS total FROM usage WHERE day = ?`)
      .get(day) as { total: number };
    return row.total;
  }
}
