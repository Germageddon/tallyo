import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from './config/env';
import { openDb } from './storage/db';
import { migrate } from './storage/migrate';
import { UsersRepo } from './storage/users-repo';
import { ExpensesRepo } from './storage/expenses-repo';
import { PendingRepo } from './storage/pending-repo';
import { FxRatesRepo } from './storage/fx-rates-repo';
import { AccessRepo } from './storage/access-repo';
import { UsageRepo } from './storage/usage-repo';
import { FxService } from './fx/fx-service';
import { FrankfurterProvider } from './fx/provider';
import { CaptureService } from './capture/capture-service';
import { RateLimiter } from './safety/rate-limiter';
import { Gate } from './safety/gate';
import { Parser } from './parser/parser';
import { NullLlmClient } from './parser/null-llm';
import { OpenAiLlmClient } from './parser/openai-client';
import type { LlmClient } from './parser/llm-client';
import { App, type AppDeps } from './app/app';
import { runCli } from './adapters/cli';
import { runTelegram } from './adapters/telegram';

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  try {
    mkdirSync(dirname(config.DB_PATH), { recursive: true });
  } catch {
    /* directory already exists */
  }

  const db = openDb(config.DB_PATH);
  migrate(db);

  const users = new UsersRepo(db, {
    defaultCurrency: config.DEFAULT_CURRENCY,
    defaultTz: config.DEFAULT_TZ,
  });
  const expenses = new ExpensesRepo(db);
  const pending = new PendingRepo(db);
  const capture = new CaptureService(db, pending, expenses);
  const fx = new FxService(new FxRatesRepo(db), new FrankfurterProvider(process.env.FRANKFURTER_BASE_URL));

  const apiKey = process.env.OPENAI_API_KEY;
  const llm: LlmClient = apiKey ? new OpenAiLlmClient(apiKey) : new NullLlmClient();
  const parser = new Parser(config.PARSER_MODE, llm);

  const baseDeps: AppDeps = { db, users, expenses, capture, parser, fx, now: () => new Date() };

  const shutdown = () => {
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (token) {
    // Public bot: enable the access gate.
    const access = new AccessRepo(db);
    const ownerRef = config.OWNER_ID ? { platform: 'telegram', platformUserId: config.OWNER_ID } : undefined;
    for (const id of config.ALLOWLIST.split(',').map((s) => s.trim()).filter(Boolean)) {
      access.approve('telegram', id, 'config');
    }
    const gate = new Gate(
      access,
      new UsageRepo(db),
      new RateLimiter(config.RATE_LIMIT_PER_MIN, 60_000, () => Date.now()),
      {
        accessMode: config.ACCESS_MODE,
        ownerRef,
        maxInputChars: config.MAX_INPUT_CHARS,
        dailyMsgQuota: config.DAILY_MSG_QUOTA,
      },
      () => new Date(),
    );
    const app = new App({ ...baseDeps, gate, access, ownerRef });
    await runTelegram(app, token);
  } else {
    // Local CLI: the operator's own machine, no access gate.
    await runCli(new App(baseDeps));
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
