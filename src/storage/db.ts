import Database from 'better-sqlite3';

export type Db = Database.Database;

export function openDb(path: string): Db {
  const db = new Database(path);
  // WAL is a no-op for :memory: but is applied for file-backed DBs at runtime.
  db.pragma('journal_mode = WAL');
  db.pragma('busy_timeout = 5000');
  db.pragma('foreign_keys = ON');
  return db;
}
