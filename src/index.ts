import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from './config/env';
import { openDb } from './storage/db';
import { migrate } from './storage/migrate';
import { UsersRepo } from './storage/users-repo';
import { ExpensesRepo } from './storage/expenses-repo';
import { PendingRepo } from './storage/pending-repo';
import { FxRatesRepo } from './storage/fx-rates-repo';
import { FxService } from './fx/fx-service';
import { FrankfurterProvider } from './fx/provider';
import { CaptureService } from './capture/capture-service';
import { Parser } from './parser/parser';
import { NullLlmClient } from './parser/null-llm';
import { OpenAiLlmClient } from './parser/openai-client';
import type { LlmClient } from './parser/llm-client';
import { App } from './app/app';
import { runCli } from './adapters/cli';

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
  const fx = new FxService(new FxRatesRepo(db), new FrankfurterProvider());

  const apiKey = process.env.OPENAI_API_KEY;
  const llm: LlmClient = apiKey ? new OpenAiLlmClient(apiKey) : new NullLlmClient();
  const parser = new Parser(config.PARSER_MODE, llm);

  // The local CLI is the operator's own machine, so it runs without the access gate.
  const app = new App({ db, users, expenses, capture, parser, fx, now: () => new Date() });

  const shutdown = () => {
    db.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await runCli(app);
}

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
