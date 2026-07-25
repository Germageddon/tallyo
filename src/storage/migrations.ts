import type { Db } from './db';

export type Migration = { version: number; up: (db: Db) => void };

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up(db) {
      db.exec(`
        CREATE TABLE users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          platform TEXT NOT NULL,
          platform_user_id TEXT NOT NULL,
          default_currency TEXT NOT NULL,
          display_currency TEXT NOT NULL,
          timezone TEXT NOT NULL,
          created_at TEXT NOT NULL,
          UNIQUE (platform, platform_user_id)
        );

        CREATE TABLE expenses (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          amount_minor INTEGER NOT NULL,
          currency TEXT NOT NULL,
          category TEXT NOT NULL,
          description TEXT NOT NULL,
          spent_on TEXT NOT NULL,
          created_at TEXT NOT NULL,
          deleted_at TEXT
        );
        CREATE INDEX idx_expenses_user_date ON expenses (user_id, spent_on);

        CREATE TABLE pending_captures (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id INTEGER NOT NULL REFERENCES users(id),
          parsed_json TEXT NOT NULL,
          status TEXT NOT NULL CHECK (status IN ('pending','committed','cancelled')),
          state TEXT NOT NULL,
          created_at TEXT NOT NULL,
          expires_at TEXT NOT NULL
        );

        CREATE TABLE fx_rates (
          rate_date TEXT NOT NULL,
          quote TEXT NOT NULL,
          rate TEXT NOT NULL,
          fetched_at TEXT NOT NULL,
          PRIMARY KEY (rate_date, quote)
        );

        CREATE TABLE access (
          platform TEXT NOT NULL,
          platform_user_id TEXT NOT NULL,
          status TEXT NOT NULL,
          approved_by TEXT,
          created_at TEXT NOT NULL,
          PRIMARY KEY (platform, platform_user_id)
        );

        CREATE TABLE usage (
          platform TEXT NOT NULL,
          platform_user_id TEXT NOT NULL,
          day TEXT NOT NULL,
          msg_count INTEGER NOT NULL DEFAULT 0,
          llm_calls INTEGER NOT NULL DEFAULT 0,
          tokens INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (platform, platform_user_id, day)
        );
      `);
    },
  },
];
