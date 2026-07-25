import type { Db } from './db';
import { MIGRATIONS } from './migrations';

export function migrate(db: Db): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  for (const m of MIGRATIONS) {
    if (m.version > current) {
      const run = db.transaction(() => {
        m.up(db);
        db.pragma(`user_version = ${m.version}`);
      });
      run();
    }
  }
}
