import type { Db } from './db';

export type AccessStatus = 'approved' | 'revoked';

export class AccessRepo {
  constructor(private readonly db: Db) {}

  getStatus(platform: string, platformUserId: string): AccessStatus | undefined {
    const row = this.db
      .prepare(`SELECT status FROM access WHERE platform = ? AND platform_user_id = ?`)
      .get(platform, platformUserId) as { status: string } | undefined;
    return row ? (row.status as AccessStatus) : undefined;
  }

  approve(platform: string, platformUserId: string, approvedBy: string): void {
    this.db
      .prepare(
        `INSERT INTO access (platform, platform_user_id, status, approved_by, created_at)
         VALUES (?, ?, 'approved', ?, ?)
         ON CONFLICT (platform, platform_user_id)
         DO UPDATE SET status = 'approved', approved_by = excluded.approved_by`,
      )
      .run(platform, platformUserId, approvedBy, new Date().toISOString());
  }

  revoke(platform: string, platformUserId: string): void {
    this.db
      .prepare(
        `INSERT INTO access (platform, platform_user_id, status, approved_by, created_at)
         VALUES (?, ?, 'revoked', NULL, ?)
         ON CONFLICT (platform, platform_user_id)
         DO UPDATE SET status = 'revoked'`,
      )
      .run(platform, platformUserId, new Date().toISOString());
  }
}
