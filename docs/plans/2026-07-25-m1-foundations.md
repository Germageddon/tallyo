# Tally — Milestone 1: Foundations — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the green skeleton — a TypeScript project with the money domain, SQLite storage + migrations, config validation, and hermetic CI — that every later milestone builds on.

**Architecture:** Ports-and-adapters. This milestone builds the innermost core with zero platform/LLM/network dependencies: a `Money` value object with per-currency ISO-4217 exponents, a `better-sqlite3` store with a `user_version` migration runner, and repositories that make an unscoped query impossible (every method requires `userId`). Everything is unit-tested with no network.

**Tech Stack:** Node 20+, TypeScript (ESM/NodeNext), better-sqlite3, zod, vitest, eslint, Docker, GitHub Actions.

**Reference spec:** `docs/DESIGN.md` (design v2).

**Git policy (project owner's rule):** Do **not** commit per task. Write files freely and leave them uncommitted. Commits are batched — one combined commit per milestone — and made **only when the owner explicitly says so**, with **no `Co-Authored-By` trailer**. Each task below ends in a **checkpoint** (tests green), not a commit. The repo is not yet `git init`'d; that also happens on the owner's say-so.

---

## File structure (this milestone)

```
Tally/
  package.json            # scripts, deps
  tsconfig.json           # ESM/NodeNext, strict
  vitest.config.ts        # test runner
  eslint.config.js        # flat config
  .gitignore
  .dockerignore
  .env.example            # documented env keys
  Dockerfile
  docker-compose.yml
  .github/workflows/ci.yml
  data/                   # (gitignored) sqlite lives here at runtime
  src/
    config/env.ts         # zod-validated config loader
    domain/
      currencies.ts       # ISO-4217 minor-unit exponents
      money.ts            # Money value object + errors
    storage/
      db.ts               # openDb() + PRAGMAs
      migrate.ts          # user_version migration runner
      migrations.ts       # MIGRATIONS array (001 = full schema)
      users-repo.ts       # UsersRepo (isolation-enforced)
      expenses-repo.ts    # ExpensesRepo (isolation-enforced)
  test/
    domain/currencies.test.ts
    domain/money.test.ts
    config/env.test.ts
    storage/db.test.ts
    storage/migrate.test.ts
    storage/users-repo.test.ts
    storage/expenses-repo.test.ts
```

**Locked contract (used by all later milestones):**
- `minorUnits(code: string): number`
- `class Money { readonly amountMinor: number; readonly currency: string }` with `Money.ofMinor`, `Money.fromDecimalString`, `.format()`, `.equals()`.
- `openDb(path: string): Database.Database`
- `migrate(db): void`
- `new UsersRepo(db, { defaultCurrency, defaultTz })` → `.upsert(platform, platformUserId)`, `.get(platform, platformUserId)`, `.getById(id)`, `.updateSettings(userId, patch)`
- `new ExpensesRepo(db)` → `.insert(userId, entry)`, `.listByRange(userId, fromDate, toDate)`, `.softDelete(userId, id)`

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `eslint.config.js`, `.gitignore`, `.dockerignore`
- Create: `test/smoke.test.ts` (throwaway, removed in Task 2)

- [ ] **Step 1: Write `package.json`**

```json
{
  "name": "tally",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:watch": "vitest",
    "ci": "npm run typecheck && npm run lint && npm run test"
  },
  "dependencies": {
    "better-sqlite3": "^11.3.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^20.14.0",
    "eslint": "^9.9.0",
    "typescript": "^5.5.4",
    "typescript-eslint": "^8.2.0",
    "vitest": "^2.0.5"
  }
}
```

- [ ] **Step 2: Write `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "lib": ["ES2022"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "types": ["node"],
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["src", "test"]
}
```

- [ ] **Step 3: Write `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    coverage: { include: ['src/**'], thresholds: { lines: 80, functions: 80 } },
  },
});
```

- [ ] **Step 4: Write `eslint.config.js`**

```js
import tseslint from 'typescript-eslint';

export default tseslint.config(
  ...tseslint.configs.recommended,
  { ignores: ['dist/**', 'data/**', 'coverage/**'] },
);
```

- [ ] **Step 5: Write `.gitignore`**

```
node_modules/
dist/
coverage/
data/
*.sqlite*
.env
```

- [ ] **Step 6: Write `.dockerignore`**

```
node_modules
dist
coverage
data
.env
*.sqlite*
.git
```

- [ ] **Step 7: Write a throwaway smoke test `test/smoke.test.ts`**

```ts
import { expect, test } from 'vitest';

test('smoke', () => {
  expect(1 + 1).toBe(2);
});
```

- [ ] **Step 8: Install and verify the toolchain**

Run: `npm install`
Then: `npm run test`
Expected: 1 passing test (`smoke`).
Then: `npm run typecheck`
Expected: exits 0, no errors.

- [ ] **Checkpoint:** `npm run test` green, `npm run typecheck` clean.

---

### Task 2: Currency exponents (`minorUnits`)

**Files:**
- Create: `src/domain/currencies.ts`
- Test: `test/domain/currencies.test.ts`
- Delete: `test/smoke.test.ts`

- [ ] **Step 1: Delete the smoke test**

Run: `rm test/smoke.test.ts`

- [ ] **Step 2: Write the failing test `test/domain/currencies.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { minorUnits } from '../../src/domain/currencies.js';

describe('minorUnits', () => {
  it('returns 2 for typical currencies', () => {
    expect(minorUnits('USD')).toBe(2);
    expect(minorUnits('EUR')).toBe(2);
  });
  it('returns 0 for zero-decimal currencies', () => {
    expect(minorUnits('JPY')).toBe(0);
    expect(minorUnits('KRW')).toBe(0);
  });
  it('returns 3 for three-decimal currencies', () => {
    expect(minorUnits('KWD')).toBe(3);
    expect(minorUnits('BHD')).toBe(3);
  });
  it('is case-insensitive', () => {
    expect(minorUnits('jpy')).toBe(0);
  });
  it('defaults to 2 for unknown codes', () => {
    expect(minorUnits('ZZZ')).toBe(2);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -- currencies`
Expected: FAIL — `Cannot find module '.../currencies.js'`.

- [ ] **Step 4: Implement `src/domain/currencies.ts`**

```ts
// ISO-4217 minor-unit exponents. Default is 2; only the exceptions are listed.
// Source: ISO-4217 published table. Extend the sets if a needed currency is missing.
const ZERO_DECIMAL = new Set([
  'JPY', 'KRW', 'ISK', 'CLP', 'VND', 'XAF', 'XOF', 'XPF',
  'GNF', 'RWF', 'UGX', 'BIF', 'DJF', 'KMF', 'PYG', 'VUV',
]);

const THREE_DECIMAL = new Set(['KWD', 'BHD', 'OMR', 'TND', 'IQD', 'JOD', 'LYD']);

export function minorUnits(code: string): number {
  const c = code.toUpperCase();
  if (ZERO_DECIMAL.has(c)) return 0;
  if (THREE_DECIMAL.has(c)) return 3;
  return 2;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- currencies`
Expected: PASS (5 tests).

- [ ] **Checkpoint:** currencies tests green.

---

### Task 3: `Money` value object

**Files:**
- Create: `src/domain/money.ts`
- Test: `test/domain/money.test.ts`

- [ ] **Step 1: Write the failing test `test/domain/money.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { Money, MoneyError } from '../../src/domain/money.js';

describe('Money.fromDecimalString', () => {
  it('parses 2-decimal currencies to minor units', () => {
    expect(Money.fromDecimalString('20', 'USD').amountMinor).toBe(2000);
    expect(Money.fromDecimalString('20.5', 'USD').amountMinor).toBe(2050);
    expect(Money.fromDecimalString('20.05', 'USD').amountMinor).toBe(2005);
  });
  it('parses zero-decimal currencies', () => {
    expect(Money.fromDecimalString('1000', 'JPY').amountMinor).toBe(1000);
  });
  it('parses three-decimal currencies', () => {
    expect(Money.fromDecimalString('1.5', 'KWD').amountMinor).toBe(1500);
  });
  it('rejects too many decimal places for the currency', () => {
    expect(() => Money.fromDecimalString('20.123', 'USD')).toThrow(MoneyError);
    expect(() => Money.fromDecimalString('1000.5', 'JPY')).toThrow(MoneyError);
  });
  it('rejects non-numeric input', () => {
    expect(() => Money.fromDecimalString('abc', 'USD')).toThrow(MoneyError);
  });
});

describe('Money', () => {
  it('ofMinor stores the exact integer', () => {
    const m = Money.ofMinor(2000, 'USD');
    expect(m.amountMinor).toBe(2000);
    expect(m.currency).toBe('USD');
  });
  it('rejects a non-integer minor amount', () => {
    expect(() => Money.ofMinor(20.5, 'USD')).toThrow(MoneyError);
  });
  it('formats per currency exponent', () => {
    expect(Money.ofMinor(2000, 'USD').format('en-US')).toBe('$20.00');
    expect(Money.ofMinor(1000, 'JPY').format('en-US')).toContain('1,000');
  });
  it('equals compares amount and currency', () => {
    expect(Money.ofMinor(2000, 'USD').equals(Money.ofMinor(2000, 'USD'))).toBe(true);
    expect(Money.ofMinor(2000, 'USD').equals(Money.ofMinor(2000, 'EUR'))).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- money`
Expected: FAIL — cannot find `money.js`.

- [ ] **Step 3: Implement `src/domain/money.ts`**

```ts
import { minorUnits } from './currencies.js';

export class MoneyError extends Error {}

export class Money {
  private constructor(
    readonly amountMinor: number,
    readonly currency: string,
  ) {}

  static ofMinor(amountMinor: number, currency: string): Money {
    if (!Number.isSafeInteger(amountMinor)) {
      throw new MoneyError(`amountMinor must be a safe integer: ${amountMinor}`);
    }
    return new Money(amountMinor, currency.toUpperCase());
  }

  static fromDecimalString(decimal: string, currency: string): Money {
    const code = currency.toUpperCase();
    const exp = minorUnits(code);
    const trimmed = decimal.trim();
    if (!/^-?\d+(\.\d+)?$/.test(trimmed)) {
      throw new MoneyError(`invalid amount: ${decimal}`);
    }
    const negative = trimmed.startsWith('-');
    const [intPart, fracPart = ''] = trimmed.replace('-', '').split('.');
    if (fracPart.length > exp) {
      throw new MoneyError(`too many decimal places for ${code}: ${decimal}`);
    }
    const fracPadded = fracPart.padEnd(exp, '0');
    const minor = Number(intPart) * 10 ** exp + Number(fracPadded || '0');
    if (!Number.isSafeInteger(minor)) {
      throw new MoneyError(`amount out of range: ${decimal}`);
    }
    return new Money(negative ? -minor : minor, code);
  }

  format(locale = 'en-US'): string {
    const exp = minorUnits(this.currency);
    const value = this.amountMinor / 10 ** exp;
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: this.currency,
    }).format(value);
  }

  equals(other: Money): boolean {
    return this.amountMinor === other.amountMinor && this.currency === other.currency;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- money`
Expected: PASS.

- [ ] **Checkpoint:** money tests green.

---

### Task 4: Config loader (zod)

**Files:**
- Create: `src/config/env.ts`
- Test: `test/config/env.test.ts`

- [ ] **Step 1: Write the failing test `test/config/env.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../../src/config/env.js';

describe('loadConfig', () => {
  it('applies defaults for an empty env', () => {
    const c = loadConfig({});
    expect(c.DB_PATH).toBe('./data/tally.sqlite');
    expect(c.DEFAULT_CURRENCY).toBe('USD');
    expect(c.DEFAULT_TZ).toBe('UTC');
    expect(c.PARSER_MODE).toBe('auto');
  });
  it('reads provided values', () => {
    const c = loadConfig({ DEFAULT_CURRENCY: 'EUR', PARSER_MODE: 'rules' });
    expect(c.DEFAULT_CURRENCY).toBe('EUR');
    expect(c.PARSER_MODE).toBe('rules');
  });
  it('rejects an invalid currency length', () => {
    expect(() => loadConfig({ DEFAULT_CURRENCY: 'US' })).toThrow(ConfigError);
  });
  it('rejects an invalid parser mode', () => {
    expect(() => loadConfig({ PARSER_MODE: 'magic' })).toThrow(ConfigError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- env`
Expected: FAIL — cannot find `env.js`.

- [ ] **Step 3: Implement `src/config/env.ts`**

```ts
import { z } from 'zod';

const ConfigSchema = z.object({
  DB_PATH: z.string().min(1).default('./data/tally.sqlite'),
  DEFAULT_CURRENCY: z.string().length(3).default('USD'),
  DEFAULT_TZ: z.string().min(1).default('UTC'),
  PARSER_MODE: z.enum(['rules', 'llm', 'auto']).default('auto'),
});

export type Config = z.infer<typeof ConfigSchema>;

export class ConfigError extends Error {}

export function loadConfig(env: NodeJS.ProcessEnv | Record<string, string | undefined>): Config {
  const result = ConfigSchema.safeParse(env);
  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new ConfigError(`invalid configuration: ${details}`);
  }
  return result.data;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- env`
Expected: PASS.

- [ ] **Checkpoint:** env tests green.

---

### Task 5: Database open + PRAGMAs

**Files:**
- Create: `src/storage/db.ts`
- Test: `test/storage/db.test.ts`

- [ ] **Step 1: Write the failing test `test/storage/db.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/storage/db.js';

describe('openDb', () => {
  it('enables foreign keys and a busy timeout', () => {
    const db = openDb(':memory:');
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- db`
Expected: FAIL — cannot find `db.js`.

- [ ] **Step 3: Implement `src/storage/db.ts`**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- db`
Expected: PASS.

- [ ] **Checkpoint:** db tests green.

---

### Task 6: Migration runner + migration 001 (full schema)

**Files:**
- Create: `src/storage/migrations.ts`, `src/storage/migrate.ts`
- Test: `test/storage/migrate.test.ts`

- [ ] **Step 1: Write the failing test `test/storage/migrate.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { openDb } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';

function tableNames(db: ReturnType<typeof openDb>): string[] {
  return db
    .prepare(`SELECT name FROM sqlite_master WHERE type='table'`)
    .all()
    .map((r) => (r as { name: string }).name);
}

describe('migrate', () => {
  it('creates the schema and sets user_version', () => {
    const db = openDb(':memory:');
    migrate(db);
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    const names = tableNames(db);
    for (const t of ['users', 'expenses', 'pending_captures', 'fx_rates', 'access', 'usage']) {
      expect(names).toContain(t);
    }
    db.close();
  });
  it('is idempotent', () => {
    const db = openDb(':memory:');
    migrate(db);
    expect(() => migrate(db)).not.toThrow();
    expect(db.pragma('user_version', { simple: true })).toBe(1);
    db.close();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- migrate`
Expected: FAIL — cannot find `migrate.js`.

- [ ] **Step 3: Implement `src/storage/migrations.ts`**

```ts
import type { Db } from './db.js';

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
```

- [ ] **Step 4: Implement `src/storage/migrate.ts`**

```ts
import type { Db } from './db.js';
import { MIGRATIONS } from './migrations.js';

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
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -- migrate`
Expected: PASS (2 tests).

- [ ] **Checkpoint:** migrate tests green.

---

### Task 7: `UsersRepo` (isolation-enforced)

**Files:**
- Create: `src/storage/users-repo.ts`
- Test: `test/storage/users-repo.test.ts`

- [ ] **Step 1: Write the failing test `test/storage/users-repo.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { UsersRepo } from '../../src/storage/users-repo.js';

let db: Db;
let repo: UsersRepo;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  repo = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
});

describe('UsersRepo', () => {
  it('creates a user with defaults on first upsert and is idempotent', () => {
    const id1 = repo.upsert('telegram', '123');
    const id2 = repo.upsert('telegram', '123');
    expect(id1).toBe(id2);
    const u = repo.getById(id1)!;
    expect(u.defaultCurrency).toBe('USD');
    expect(u.timezone).toBe('UTC');
  });
  it('keeps the same numeric id on different platforms separate', () => {
    const tg = repo.upsert('telegram', '123');
    const dc = repo.upsert('discord', '123');
    expect(tg).not.toBe(dc);
  });
  it('updates settings', () => {
    const id = repo.upsert('telegram', '123');
    repo.updateSettings(id, { displayCurrency: 'EUR', timezone: 'Europe/Berlin' });
    const u = repo.getById(id)!;
    expect(u.displayCurrency).toBe('EUR');
    expect(u.timezone).toBe('Europe/Berlin');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- users-repo`
Expected: FAIL — cannot find `users-repo.js`.

- [ ] **Step 3: Implement `src/storage/users-repo.ts`**

```ts
import type { Db } from './db.js';

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
    const values: unknown[] = [];
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
    this.db.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`).run(...(values as never[]));
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- users-repo`
Expected: PASS.

- [ ] **Checkpoint:** users-repo tests green.

---

### Task 8: `ExpensesRepo` (isolation-enforced)

**Files:**
- Create: `src/storage/expenses-repo.ts`
- Test: `test/storage/expenses-repo.test.ts`

- [ ] **Step 1: Write the failing test `test/storage/expenses-repo.test.ts`**

```ts
import { beforeEach, describe, expect, it } from 'vitest';
import { openDb, type Db } from '../../src/storage/db.js';
import { migrate } from '../../src/storage/migrate.js';
import { UsersRepo } from '../../src/storage/users-repo.js';
import { ExpensesRepo } from '../../src/storage/expenses-repo.js';

let db: Db;
let users: UsersRepo;
let expenses: ExpensesRepo;
let userA: number;
let userB: number;

beforeEach(() => {
  db = openDb(':memory:');
  migrate(db);
  users = new UsersRepo(db, { defaultCurrency: 'USD', defaultTz: 'UTC' });
  expenses = new ExpensesRepo(db);
  userA = users.upsert('telegram', 'A');
  userB = users.upsert('telegram', 'B');
});

const entry = (over: Partial<Parameters<ExpensesRepo['insert']>[1]> = {}) => ({
  amountMinor: 2000,
  currency: 'USD',
  category: 'Food',
  description: 'lunch',
  spentOn: '2026-06-15',
  ...over,
});

describe('ExpensesRepo', () => {
  it('inserts and lists within a date range for the owner only', () => {
    expenses.insert(userA, entry({ spentOn: '2026-06-15' }));
    expenses.insert(userA, entry({ spentOn: '2026-07-01' }));
    const june = expenses.listByRange(userA, '2026-06-01', '2026-06-30');
    expect(june).toHaveLength(1);
    expect(june[0]!.description).toBe('lunch');
  });
  it('does not leak another user\\'s rows', () => {
    expenses.insert(userA, entry());
    expect(expenses.listByRange(userB, '2026-01-01', '2026-12-31')).toHaveLength(0);
  });
  it('soft-deletes only the owner\\'s row and hides it from reports', () => {
    const id = expenses.insert(userA, entry());
    expect(expenses.softDelete(userB, id)).toBe(false); // not the owner
    expect(expenses.softDelete(userA, id)).toBe(true);
    expect(expenses.listByRange(userA, '2026-01-01', '2026-12-31')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -- expenses-repo`
Expected: FAIL — cannot find `expenses-repo.js`.

- [ ] **Step 3: Implement `src/storage/expenses-repo.ts`**

```ts
import type { Db } from './db.js';

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test -- expenses-repo`
Expected: PASS (3 tests).

- [ ] **Checkpoint:** expenses-repo tests green; full suite green via `npm run test`.

---

### Task 9: CI pipeline + README skeleton

**Files:**
- Create: `.github/workflows/ci.yml`, `README.md`, `.env.example`

- [ ] **Step 1: Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push:
  pull_request:
jobs:
  build:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        node: [20, 22]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: ${{ matrix.node }}
          cache: npm
      - run: npm ci
      - run: npm run ci
```

- [ ] **Step 2: Write `.env.example`**

```
# Storage
DB_PATH=./data/tally.sqlite

# Defaults for new users
DEFAULT_CURRENCY=USD
DEFAULT_TZ=UTC

# Parser: rules | llm | auto  (auto = rules first, LLM only when unsure)
PARSER_MODE=auto

# --- keys below are added in later milestones ---
# TELEGRAM_BOT_TOKEN=
# LLM_PROVIDER=openai
# OPENAI_API_KEY=
# OLLAMA_BASE_URL=http://host.docker.internal:11434
```

- [ ] **Step 3: Write `README.md` skeleton**

```markdown
# Tally

A self-hostable ledger bot that gets multi-currency money right — every expense stored in
integer minor units and converted at the actual ECB rate on the day you spent it,
reproducibly. You log by texting it in plain language.

> Status: in development. See [docs/DESIGN.md](docs/DESIGN.md).

## Quickstart (dev)

```bash
npm install
npm run ci   # typecheck + lint + tests, fully offline
```
```

- [ ] **Step 4: Verify the CI command locally**

Run: `npm run ci`
Expected: typecheck clean, lint clean, all tests PASS.

- [ ] **Checkpoint:** `npm run ci` green locally (this is exactly what GitHub Actions will run).

---

### Task 10: Docker skeleton

**Files:**
- Create: `Dockerfile`, `docker-compose.yml`

- [ ] **Step 1: Write `Dockerfile`**

```dockerfile
FROM node:20-slim AS base
WORKDIR /app
# better-sqlite3 builds a native addon; slim needs build tooling at install time.
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run typecheck
CMD ["node", "--experimental-strip-types", "src/index.ts"]
```

> Note: `src/index.ts` (the entrypoint) does not exist yet — it is created in Milestone 3. Until then this image is for building/CI parity only; `docker build` must still succeed.

- [ ] **Step 2: Write `docker-compose.yml`**

```yaml
services:
  tally:
    build: .
    container_name: tally-bot
    restart: unless-stopped
    env_file: .env
    volumes:
      - tally-data:/app/data
    # No published ports: the bot uses Telegram long-polling (outbound only).

volumes:
  tally-data:
```

- [ ] **Step 3: Verify the image builds**

Run: `docker build -t tally:dev .`
Expected: build succeeds through `npm run typecheck` (native better-sqlite3 compiles).

- [ ] **Checkpoint:** image builds. Milestone 1 complete — `npm run ci` green, `docker build` green.

---

## Self-review (completed)

- **Spec coverage (M1 slice):** money/minor-units ✓, migrations/`user_version` ✓, WAL/busy_timeout ✓, structural isolation (userId required, `(platform, platform_user_id)` key) ✓, hermetic CI ✓, Docker skeleton ✓, `.env.example` ✓. Deferred to later milestones by design: FX, parser, conversation FSM, Telegram adapter, reports/CSV, allowlist/limits, logging, `/forget`.
- **Placeholders:** none — every step has full file contents/commands.
- **Type consistency:** `Db`, `Money`, `minorUnits`, `UsersRepo`/`ExpensesRepo` method names and row shapes are consistent across tasks and match the locked contract.

## Next milestones (to be planned after M1 executes)

- **M2 — Core capture (no Telegram):** FX (Frankfurter client + cache + EUR-pivot HALF_EVEN conversion + weekend resolution), rules+LLM parser with zod contract + grounding + deterministic currency/date resolution, `pending_captures` FSM + idempotent commit, reports, formula-safe CSV export, and a **CLI adapter** so the whole core is exercised end-to-end offline.
- **M3 — Telegram:** grammY adapter over MessagingPort, `/start` onboarding, command menu, confirm/edit cards, `/undo` `/delete` `/report` `/export` `/settings`.
- **M4 — Public-safety + ship:** allowlist + rate limits + global kill-switch + input caps, pino PII-safe logging, `/forget`, backups doc, README demo GIF + badges, deploy to the TNA fun server.
