# Tally

A self-hostable ledger bot that gets multi-currency money right — every expense stored in
integer minor units and converted at the actual ECB rate on the day you spent it,
reproducibly. You log by texting it in plain language.

> Status: in development. See [docs/DESIGN.md](docs/DESIGN.md) for the design and
> [docs/plans/](docs/plans) for the implementation plan.

## Quickstart (dev)

```bash
npm install
npm run ci   # typecheck + lint + tests, fully offline
```

## Scripts

- `npm run test` — run the test suite (Vitest, no network)
- `npm run typecheck` — `tsc --noEmit`
- `npm run lint` — ESLint
- `npm run ci` — all three, the same gate CI runs
