# Tally — design spec

> Working name — **must be renamed before publishing** ("Tally" collides with tally.xyz, Tally Ho wallet, Tally.so). Candidates: Quipu, Plainledger, Ledgerline. Verify `npm view <name>` 404 + GitHub search before locking.

> A self-hostable ledger bot that gets **multi-currency money right** — every expense stored in integer minor units and converted at the **actual ECB rate on the day you spent it, reproducibly**. You log by texting it in plain language.

**Status:** design v2 — hardened 2026-07-25 after a 9-lens adversarial review. Next step: implementation plan.

---

## Positioning (what makes this not "expense tracker #4001")

The wedge, in priority order — the README must lead with #1, not the chat gimmick:

1. **Provably-correct multi-currency money.** Integer minor units per ISO-4217 (JPY has 0 decimals, KWD has 3 — never a blanket ÷100), and historical FX at the transaction date, so a past-period report is byte-identical every time you run it.
2. **Fully self-hostable & private.** `docker compose up` and it runs — **no API key required** (see the parser). Your financial data never leaves your box.
3. **Zero-friction capture.** You text it naturally; it does the bookkeeping.

"Another GPT expense bot" is a death sentence on HN/Reddit. We lead with correctness and self-hosting; the NL capture is the input method, not the headline.

## Goals

- Correct money: integer minor units, per-currency exponents, reproducible historical FX.
- Zero-friction capture: free-text, multiple items per message, any currency, relative dates.
- Self-hostable & private: one-command run, no mandatory paid service, optional local LLM.
- Multi-platform-ready: platform-agnostic core; Telegram first.
- Portfolio-grade: clean architecture, hermetic CI, real tests, a README that earns a second look.

## Non-goals (v1)

Budgets/alerts · recurring expenses · receipt OCR · charts/web dashboard · income & balances · group/split expenses · crypto pricing · Postgres · Discord/WhatsApp adapters. See Roadmap & Rejected.

---

## v1 scope

1. **Log by text.** `spent $20 on food, 10 on gas` → parsed into line-items. **Confidence-gated**: unambiguous parses auto-save with a one-tap **Undo**; ambiguous / low-confidence / multi-currency parses show a grouped confirm card (✅ / ✏️ / ❌).
2. **Auto-categorize** into a fixed set (Food, Groceries, Transport, Housing, Utilities, Entertainment, Shopping, Health, Travel, Other); user can override per item.
3. **Report by range.** `/report last month`, `/report 2026-06-01 2026-06-30` → grouped by category with totals **in an explicit display currency**, each row converted at its own transaction-date rate.
4. **Export** the same range to **CSV** (formula-injection-safe).
5. **Correct after the fact.** `deleted_at` soft-delete; `/undo` (removes last confirmed message's entries); per-entry id token (`#412`) so `/delete 412` works.
6. **Settings.** `/settings` (button pickers, never the LLM): default input currency, display currency, timezone.
7. **Onboarding.** `/start` sets currency + timezone via inline keyboards; logging works before onboarding using safe defaults (USD/UTC) with a nudge.
8. **Erase.** `/forget` → confirm → transactional hard-delete of the user's data (GDPR note in README).
9. **Multi-user**, structurally isolated (see Security).

---

## Architecture — platform-agnostic core + thin adapters

The core knows nothing about Telegram. An adapter maps a platform event → normalized inbound, and knows how to send replies/documents/buttons back.

### Ports
- **MessagingPort** — inbound is a **discriminated union**: `{kind:'text', userRef, text, sentAt}` | `{kind:'action', userRef, actionId, refId}` (button taps: `refId` = pending-capture id, carried in Telegram `callback_data` / Discord `custom_id`). Outbound: `sendText` / `sendDocument` / `sendButtons` / `answerAction`.
- **LlmClient** — single method `parse(text, ctx) → RawParse`. Impls: OpenAI, Anthropic, Ollama. **Mockable seam** — the whole test suite runs against a recorded-fixture mock (see Testing).
- **FxPort** — `getRate(quote, date) → {rate, rateDate}` (base is always EUR; see FX). Impl: Frankfurter + cache.
- **StoragePort** — repository for all tables. **Every method takes `userId` as a required argument** — an unscoped query is unrepresentable.

### Conversation state lives in the core, not grammY sessions
The confirm/edit loop spans turns and **must survive a redeploy**. State is a DB table (`pending_captures`), driven by an explicit FSM: `IDLE → AWAITING_CONFIRM(id) → AWAITING_EDIT(id)`. grammY's in-memory session is **not** used for capture state.

---

## Parser — rules-first, LLM-optional

`PARSER_MODE = rules | llm | auto` (default **auto**: deterministic rules first, LLM only when rules are low-confidence). Consequence: **`docker compose up` works with no API key and no Ollama** for the happy path, and simple logs cost zero LLM calls.

- **Rules parser** (regex/PEG): handles `<amount> <currency?> <description>`, comma/`and`-separated multi-item, and relative dates. This is the MVP floor if the month gets tight.
- **LLM fallback**: only for phrasings rules can't confidently handle. Reads as senior judgment ("don't reach for an LLM when a parser suffices") and defuses the "GPT-wrapper" dismissal.

### LLM contract (untrusted — validated, not trusted)
- User text goes **only inside a delimited data field**, never concatenated into the instruction/system string. The parser never calls tools or emits SQL.
- Call at `temperature 0` with provider JSON mode; validate output against a **Zod schema** (array of line-items). On failure: **one** bounded retry feeding back the validation error, then a typed error — **never a partial write**.
- **Category** is a Zod enum of the exact fixed ids; off-list values coerce to `uncategorized` (never persisted verbatim).
- **Amount grounding**: every returned numeric amount's digits must appear in the source text; otherwise mark `LOW_CONFIDENCE` → force the confirm card.
- **Error states**: `INVALID_JSON`, `SCHEMA_MISMATCH`, `LOW_CONFIDENCE`, `LLM_UNAVAILABLE` (bounded timeout + backoff). The raw user text is always preserved so nothing is lost.

### Deterministic resolution (post-LLM, in code — not the model)
- **Currency precedence**: explicit symbol/code in text > user `default_currency` > global fallback. The LLM returns a currency **only** when a symbol/code is present, else `null` and code fills the default. Ambiguous `$` → user default if it's a `$` currency, else clarify.
- **Relative dates**: LLM emits a relative descriptor or tz-naive ISO date; code resolves it against the user's stored **IANA timezone** + an injected `now`.
- **Separators**: normalize `1.234,56` vs `1,234.56` in code.
- The confirm card **shows the resolved currency and date** (`$20 → USD 20.00 · Jun 14`) so a mis-resolution is catchable.

---

## Money & FX

- **Money = integer minor units + ISO-4217 code.** No IEEE-754 float anywhere in the money path. A `Money` value object owns arithmetic/format.
- **Per-currency exponent** comes from a version-controlled **ISO-4217 minor-units map** (0 for JPY/KRW/ISK, 2 for most, 3 for KWD/BHD/OMR/TND). Every minor↔decimal conversion, display, and CSV cell uses `10 ** exponent(currency)` — **never a fixed 2**.
- **Display** via `Intl.NumberFormat` (or the exponent map): `¥1,000`, `1.500 KWD`, `$1,000.00`. Locale affects display only; storage is never rounded to match display.

### Conversion math (stated once, used everywhere)
- ECB publishes **EUR-base** rates only. Cross-rate X→Y on date D = `(EUR→Y)/(EUR→X)` computed at **full precision** with a decimal/bigint lib; **round only the final `dest_minor` once**, `HALF_EVEN`. Never round the EUR leg (avoids cross-rate drift).
- `dest_minor = round_half_even( src_minor / 10^exp(src) * rate * 10^exp(dest) )`.

### Historical rate resolution
- Resolve a spend's rate to the **latest ECB publication date ≤ `spent_on`** — this handles weekends/holidays naturally (a Saturday resolves to Friday). Persist the effective `rateDate`.
- Reject **future-dated** conversions and dates **before the earliest available** rate for that currency (typed hard errors).
- **ECB-unsupported currency**: store the original; reports show it on a clearly-labeled "not converted" line — never dropped or zeroed.

### Storage & totals rule
- Persist the **original** `amount_minor` + `currency` + `spent_on` as immutable truth. Historical ECB rates for a past date never change, so converting at read time from the cache is **reproducible**.
- **Every total/report takes an explicit target currency**, converts each row via its transaction-date rate, then sums in the **target's** integer minor units. `SUM(amount_minor)` across mixed currencies is **forbidden**. "Convert my whole ledger at today's rate" is a separate, explicitly-non-reproducible view.

---

## Data model (SQLite)

- **currencies** (static reference, in code): `code`, `minor_units`.
- **users** — `id`, `platform`, `platform_user_id`, `default_currency`, `display_currency`, `timezone`, `created_at`. Defaults USD/USD/UTC.
- **expenses** — `id`, `user_id`, `amount_minor` (int), `currency`, `category`, `description`, `spent_on` (date), `created_at`, **`deleted_at`** (soft-delete; reports filter `deleted_at IS NULL`).
- **pending_captures** — `id`, `user_id`, `parsed_json`, `status` CHECK(`pending|committed|cancelled`), `state`, `created_at`, `expires_at`.
- **fx_rates** — `rate_date`, `quote`, `rate`, `fetched_at`; unique `(rate_date, quote)` (base EUR implicit). Writes use `ON CONFLICT DO NOTHING`.
- **access** — `platform`, `platform_user_id`, `status`, `approved_by`, `created_at`.
- **usage** — `platform`, `platform_user_id`, `day`, `msg_count`, `llm_calls`, `tokens`; PK `(user, day)`.
- **Migrations**: forward-only runner keyed on `PRAGMA user_version`, applied in a transaction at startup; migration 001 = initial schema. `PRAGMA journal_mode=WAL`, `busy_timeout=5000` on open.

---

## Security, privacy & public-bot abuse

A public bot with an LLM behind every message bills the **operator**. Mitigations are v1, not later:

- **Default-closed access gate.** `ACCESS_MODE=allowlist|open` (default **allowlist**), `OWNER_USER_ID`, `ALLOWLIST` env, `access` table, owner-only `/approve <id>` & `/revoke`. Non-allowlisted senders get a canned reply and **never reach LlmClient**.
- **Rate limits & caps.** `RATE_LIMIT_MSGS_PER_MIN` (~10, checked before any LLM call), `LLM_DAILY_CALLS_PER_USER` (~50), `LLM_GLOBAL_DAILY_CALLS/TOKENS` (global kill-switch → "temporarily unavailable" + operator log for the rest of the UTC day), `MAX_INPUT_CHARS` (~500, rejected pre-LLM), `MAX_ENTRIES_PER_MESSAGE` (~20). All env-tunable, reset by UTC day.
- **Structural isolation.** `userId` required on every StoragePort method; isolation key `(platform, platform_user_id)` so a Telegram id and a Discord id that collide numerically stay separate. Tested (see Testing).
- **Idempotent commit.** Committing a capture: `UPDATE pending_captures SET status='committed' WHERE id=? AND status='pending'` and only insert expenses in the **same transaction** if that UPDATE changed a row; verify the tapping user owns the capture; strip the keyboard + `answerCallbackQuery`. Double-taps/redelivered callbacks can't double-insert.
- **Secrets & PII.** `.env` gitignored, `.env.example` committed; DB file mode `0600`, `*.sqlite*` ignored. **pino** structured logs carry metadata only (hashed user id, entry count, currency, latency) — **never** raw message text, amounts, or LLM prompt/response bodies except at opt-in debug; token/keys redacted.
- **Erasure.** `/forget` transactional hard-delete + README privacy note.

---

## Conversation & UX

- **Command menu** via `setMyCommands` (start, report, export, settings, undo, help) so Telegram shows the `/` menu. `/start` and `/help` show a 2-line "try this" example.
- **Confirm card** (only when needed): one grouped card listing numbered items, single **✅ Confirm-all**; **✏️** → per-item edit (v1: change Category via the fixed-category buttons, or Remove-item); **❌** cancel. No one-message-per-item spam.
- **Error taxonomy.** User errors → a targeted question ("How much was the coffee?"). System errors → own it + preserve text ("My parser is down for a sec — your message is safe, resend in a moment"). FX fetch fails during `/report` → still render in original currencies rather than erroring.
- **Empty states** for report/export before any data (doubles as onboarding).
- `/export [range]` mirrors `/report`'s grammar; delivered via `sendDocument` with a dated filename; every report also has an **⬇️ Export CSV** button.

---

## Stack

- **Node + TypeScript.**
- **grammY** (+ persistent state in SQLite via StoragePort; **long-polling** default — see Deployment).
- **better-sqlite3** (single-process, synchronous, WAL) behind StoragePort; Postgres is a future swap.
- **zod** — LLM output + env validation.
- **decimal/bigint lib** for FX math (no float).
- **pino** — structured logging with redaction.
- LLM: provider-agnostic behind `LlmClient` (OpenAI/Anthropic/Ollama).
- **Frankfurter** — free ECB historical fiat FX, no key.
- **Docker + docker-compose.**
- **vitest** + GitHub Actions.

---

## Deployment

- **Long-polling by default** (`bot.start()`; no inbound port/TLS/NAT). Webhook is opt-in/advanced.
- **One `docker compose up -d` service**: dedicated `container_name`/volume/network (`tally-*`, must not collide with the 420 bot), `restart: unless-stopped`, `env_file`, **no published host ports** under polling.
- **DB on a named volume** outside any repo/served path; documented live-safe backup (`VACUUM INTO` / `.backup`) + restore in README.
- **Env validated with zod at startup** — exit non-zero listing what's missing. Keys: `TELEGRAM_BOT_TOKEN`, `PARSER_MODE`, `LLM_PROVIDER`/keys/model, `OLLAMA_BASE_URL` (default `http://host.docker.internal:11434` + `extra_hosts: host-gateway`), `DB_PATH`, `FRANKFURTER_BASE_URL`, `DEFAULT_CURRENCY`, `DEFAULT_TZ`, access/limit keys above.
- **Graceful shutdown**: trap SIGTERM/SIGINT → stop poller → `db.close()`.
- **Host:** the shared TNAHosting "fun server" (already runs the 420 bot; isolate container/volume/network). **Never** the RackNerd box (LucidexBot prod) — off-limits.

---

## Testing & CI

- **Hermetic — zero network in CI.** `LlmClient` mocked via recorded fixtures/golden tests; `FxPort` reads a seeded rate fixture. Any real-provider/Ollama call is an opt-in smoke script **outside** the gate.
- **Money**: property tests — conversions and sums never lose/gain minor units, across non-2-decimal currencies (JPY/USD/BHD).
- **FX**: deterministic resolution incl. weekend/holiday backward-resolution and typed errors for future/pre-1999/unsupported.
- **Parser**: fixture suite of real phrasings → asserted line-items (LLM mocked).
- **Isolation**: seeded two-user DB — A's `/report` and CSV never return B's rows; same numeric id under different platforms = two ledgers.
- **CSV**: golden-file test with a description containing a comma, a quote, and a `=HYPERLINK`/`@SUM` payload → byte-compare against a committed expected `.csv`; cells beginning `= + - @` (or tab/CR) are apostrophe-prefixed; comma/quote/newline fields quoted+escaped.
- **CI**: `.github/workflows/ci.yml` on push/PR → `tsc --noEmit` + eslint + `vitest run --coverage` on Node 20/22; ~80% floor on core/domain; CI + coverage + license badges in README.

---

## README first screen (highest-ROI traction asset)

Differentiator one-liner (correctness-led) · an **animated demo GIF** (mixed-currency text → parse echo → `/report` in a display currency) · above-the-fold one-command quickstart with **"no API key required"** · a tiny FX-correctness proof block ("€20 on 2021-01-05 → report in USD uses that day's ECB rate") · CI/coverage/license badges · link to this DESIGN.md.

---

## Roadmap (post-v1)

- **One CLI/stdin adapter** implementing MessagingPort — cheapest credible proof the core is platform-agnostic + a scriptable integration harness. (Do if time allows; still **not** Discord/WhatsApp in v1.)
- **Rename** before publishing (npm + GitHub clear).
- **Crypto historical pricing** — keep `FxPort.getRate(quote, date)` asset-agnostic so a crypto impl needs no core change; tease prominently in the README roadmap (sharpest hook for the crypto-dev crowd).
- **Postgres** validated via an impl-agnostic StoragePort contract suite (written now, run against SQLite only in v1 CI).
- Richer confirm editing (per-field amount/date/description), edit-confirmed-entries.
- Docker `HEALTHCHECK` (DB opens + fresh last-poll) and a fully-offline mode (skip FX).
- Discord (`discord.js`), then WhatsApp (official Cloud API for a real public bot; unofficial Baileys = ToS/ban risk, personal-use only).

## Explicitly rejected (deliberate scope discipline)

Multi-provider FX / spreads / intraday · self-hosted or fine-tuned LLM in v1 · Redis / external session store / queue (the `pending_captures` table + FSM cover state in SQLite) · at-rest DB encryption / OAuth / CAPTCHA (allowlist + caps + file perms + query scoping suffice) · web dashboard / charts (dilutes the wedge, blows the budget) · live-LLM/Ollama tests in CI (non-deterministic) · NL settings editor (keep `/settings` deterministic) · heavy ORM / migration framework (a `user_version` runner is enough).
