# Tallyo

Track your spending by just **texting a bot**. Log expenses in plain words, get clean reports, in any currency — no apps, no spreadsheets.

## 🤖 Try it now — no setup

**Tallyo is live on Telegram right now, free and open to everyone:**

### 👉 [t.me/TallyoBot](https://t.me/TallyoBot)

Open it, hit **Start**, and just text it what you spent:

```
coffee 5, gas 10
groceries 40
grabbed lunch with friends, my share was about 15
```

It logs them instantly. Tap **Report** for a breakdown, or **Export** for a CSV. That's the whole thing.

## What it does

- 🗣️ **Plain-language logging** — type however you talk. `coffee 5`, several items at once, or a full sentence.
- 💱 **Any currency, done right** — 156 currencies, each converted at the *real exchange rate from the day you spent* (not today's).
- 📊 **Reports & CSV export** — today, this/last month, this/last year, all-time, or a custom date range.
- ↩️ **Undo & delete** — fix a mistake with one tap, or remove any past entry.
- 🌍 **Set your currency & timezone** with a couple of taps — no typing.

## How it works

- Simple entries are read by a fast **rules parser** — instant, and completely free (no AI involved).
- Only messy phrasing (*"my share of dinner was like 40"*) falls back to an **AI**, which is validated so it can never invent an amount.
- Money is stored as **whole cents** (never floating-point) and converted with historical **European Central Bank** rates, so a report of a past period comes out identical every time.

## Run your own copy

Prefer to self-host and keep your data on your own machine? You can.

**Just try the engine locally (no bot needed):**

```bash
npm install
npm start        # a little CLI — type "coffee 5, gas 10", then /report
```

**Run it as your own Telegram bot:**

1. Create a bot with [@BotFather](https://t.me/BotFather) (`/newbot`) and copy the token.
2. `cp .env.example .env` and set `TELEGRAM_BOT_TOKEN`. Optionally add a **free** [Groq](https://console.groq.com) key (`GROQ_API_KEY`) to turn on the AI fallback — OpenAI and local Ollama also work.
3. `docker compose up -d`

A fresh self-hosted bot is **private by default** (allowlist — only you). Set `ACCESS_MODE=open` in `.env` to let anyone use it (that's how the public [@TallyoBot](https://t.me/TallyoBot) runs). See [`.env.example`](.env.example) for all settings.

## For developers

TypeScript, **ports-and-adapters**: a platform-agnostic core with thin adapters on top. A CLI and a Telegram adapter ship today — Discord and WhatsApp are each just one more adapter, no core changes.

```
domain/   money (integer minor units, ISO-4217 exponents), HALF_EVEN EUR-pivot FX, categories
storage/  SQLite + versioned migrations, user-scoped repositories
fx/       historical-rate cache + service (ECB rates via Frankfurter)
parser/   rules-first + AI fallback (schema-validated, amount-grounded)
capture/  confirm/commit state machine (idempotent, crash-safe)
safety/   access gate + rate limits + quotas
app/      orchestration  ·  adapters/ = CLI + Telegram
```

- `npm test` — **124 tests**, fully offline (no network)
- `npm run ci` — typecheck + lint + tests (the gate that runs on every push)

Full design write-up: [docs/DESIGN.md](docs/DESIGN.md).

## License

MIT — see [LICENSE](LICENSE). Free to use, self-host, and modify.
