# Tallyo

A self-hostable ledger bot that gets **multi-currency money right**: every expense is stored
in integer minor units and converted at the **actual ECB rate on the day you spent it**, so a
past-period report is byte-identical every time you run it. You log by texting it in plain
language — **no API key required** for the common case.

- **Correct money.** Per-currency ISO-4217 exponents (JPY has 0 decimals, KWD has 3 — never a
  blanket ÷100). Exact `HALF_EVEN` conversion through an EUR pivot, rounded once. No floats.
- **Zero-friction capture.** `coffee 5, gas 10` → two categorized entries. A deterministic
  rules parser handles the common case with **no LLM call**; an LLM is only a fallback for
  messy phrasing (and stays behind schema validation + amount-grounding).
- **Self-hostable & private.** SQLite, one-command Docker, optional local LLM (Ollama). Your
  financial data never has to leave your machine.
- **Safe as a public bot.** Default-closed allowlist, per-user rate limits + daily quota, and
  an input cap — a stranger can't run up your LLM bill.

## Quickstart (local CLI, no setup)

```bash
npm install
npm run ci      # typecheck + lint + 105 tests, fully offline
npm start       # then type:  coffee 5, gas 10   →   /report this month   →   /export this month
```

## Run it on Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy the token.
2. `cp .env.example .env` and set:
   - `TELEGRAM_BOT_TOKEN=…`
   - `OWNER_ID=<your telegram user id>` (bypasses the allowlist)
   - `ACCESS_MODE=allowlist` (default) and `ALLOWLIST=<comma-separated telegram ids>`, or
     `ACCESS_MODE=open` to let anyone in.
   - Optional: `OPENAI_API_KEY` to enable the LLM fallback for messy phrasing.
3. `npm start` (or `docker compose up -d`).

Then message your bot: `spent $20 on groceries`, `/report last month`, `/export`.

## Commands

`/report` · `/export` · `/settings` · `/currency USD` · `/timezone Europe/Berlin` ·
`/forget` · `/help`. Owner-only: `/approve <id>` · `/revoke <id>`.

## Configuration (env)

| Key | Default | Notes |
|---|---|---|
| `DB_PATH` | `./data/tally.sqlite` | SQLite file |
| `DEFAULT_CURRENCY` / `DEFAULT_TZ` | `USD` / `UTC` | defaults for new users |
| `PARSER_MODE` | `auto` | `rules` \| `llm` \| `auto` (rules first, LLM on miss) |
| `TELEGRAM_BOT_TOKEN` | — | set to run on Telegram; unset → local CLI |
| `ACCESS_MODE` | `allowlist` | `allowlist` \| `open` |
| `OWNER_ID` / `ALLOWLIST` | — | owner id / comma-separated approved ids |
| `RATE_LIMIT_PER_MIN` / `DAILY_MSG_QUOTA` / `MAX_INPUT_CHARS` | `10` / `100` / `500` | abuse limits |
| `OPENAI_API_KEY` | — | enables the LLM fallback parser |

## Architecture

Ports-and-adapters: a platform-agnostic core (money, FX, parser, capture, reporting) with thin
adapters on top (a local **CLI** and a **Telegram** adapter today; Discord/WhatsApp are a
small adapter away). See [docs/DESIGN.md](docs/DESIGN.md) for the full design and
[docs/plans/](docs/plans) for the build plan.

```
domain/   money + ISO-4217 exponents, HALF_EVEN EUR-pivot FX, categories
storage/  SQLite + user_version migrations, user-scoped repositories
fx/       historical-rate cache + service (Frankfurter / offline provider)
parser/   rules-first parser + LLM fallback (zod-validated, amount-grounded)
capture/  pending-capture FSM with idempotent, atomic commit
safety/   allowlist gate + rate limiter + quotas
app/      orchestration; adapters/ CLI + Telegram
```

## Development

- `npm run test` — Vitest (hermetic, no network)
- `npm run typecheck` / `npm run lint`
- `npm run ci` — the gate CI runs on every push
