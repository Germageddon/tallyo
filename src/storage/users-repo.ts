import type { Db } from './db';

export type UserRow = {
  id: number;
  platform: string;
  platformUserId: string;
  defaultCurrency: string;
  displayCurrency: string;
  timezone: string;
};

export type SettingsPatch = Partial<
  Pick<UserRow, 'defaultCurrency' | 'displayCurrency' | 'timezone'>
>;

export class UsersRepo {
  constructor(
    private readonly db: Db,
    private readonly defaults: { defaultCurrency: string; defaultTz: string },
  ) {}

  upsert(platform: string, platformUserId: string): number {
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO users
           (platform, platform_user_id, default_currency, display_currency, timezone, created_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (platform, platform_user_id) DO NOTHING`,
      )
      .run(
        platform,
        platformUserId,
        this.defaults.defaultCurrency,
        this.defaults.defaultCurrency,
        this.defaults.defaultTz,
        now,
      );
    const row = this.db
      .prepare(`SELECT id FROM users WHERE platform = ? AND platform_user_id = ?`)
      .get(platform, platformUserId) as { id: number };
    return row.id;
  }

  get(platform: string, platformUserId: string): UserRow | undefined {
    return this.mapRow(
      this.db
        .prepare(`SELECT * FROM users WHERE platform = ? AND platform_user_id = ?`)
        .get(platform, platformUserId),
    );
  }

  getById(id: number): UserRow | undefined {
    return this.mapRow(this.db.prepare(`SELECT * FROM users WHERE id = ?`).get(id));
  }

  updateSettings(userId: number, patch: SettingsPatch): void {
    const sets: string[] = [];
    const values: (string | number)[] = [];
    if (patch.defaultCurrency !== undefined) {
      sets.push('default_currency = ?');
      values.push(patch.defaultCurrency);
    }
    if (patch.displayCurrency !== undefined) {
      sets.push('display_currency = ?');
      values.push(patch.displayCurrency);
    }
    if (patch.timezone !== undefined) {
      sets.push('timezone = ?');
      values.push(patch.timezone);
    }
    if (sets.length === 0) return;
    values.push(userId);
    this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }

  private mapRow(row: unknown): UserRow | undefined {
    if (!row) return undefined;
    const r = row as Record<string, unknown>;
    return {
      id: r.id as number,
      platform: r.platform as string,
      platformUserId: r.platform_user_id as string,
      defaultCurrency: r.default_currency as string,
      displayCurrency: r.display_currency as string,
      timezone: r.timezone as string,
    };
  }
}
