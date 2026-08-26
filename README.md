# Hearthstone

A private budget & debt-payoff tracker for a two-person household, migrated from
a Google Sheets workbook. Both people log in separately and see the same
household's data.

## What it does

- **Bills & debts** with a ledger-derived payment cycle (`unpaid → pending →
  partial → cleared`), universal partial payments, payment reversals, and
  fees.
- **Past due is money, not a flag** — missed cycles plus manual carry-in,
  computed from the ledger (`src/lib/arrears.ts`).
- **Paycheck budgeting** — per-pay-period planning, allocation to categories /
  goals / specific bills, recurrence projection for forward periods.
- **Savings goals & bill envelopes**, invoices with payment plans, income
  sources with deposit splits and pre/post-tax deductions.
- **Deduction-funded** bills/debts settle automatically when a paycheck is
  marked received; **auto-transfers** track recurring money movement between the
  household's own accounts.
- Split transactions, transfers, cash advances, per-user color themes, spending
  by place, a one-page status-snapshot export, a 12-month payment schedule, and
  a net-worth trend.

## Stack

| Layer | Tool |
|---|---|
| App | React 19 · Vite 8 · TanStack Start (SSR) + Router + Query · Tailwind v4 · Radix UI · Recharts |
| Backend | Self-managed [Supabase](https://supabase.com) — Postgres + Auth + Row-Level Security |
| Build / deploy | nitro → Cloudflare (`.output/`) |
| Android shell | [Capacitor](https://capacitorjs.com) — *planned (Phase 12), not started* |

Supabase's URL and **publishable** key are hard-coded in `src/lib/supabase.ts`
(safe in the client — RLS enforces access). **The app needs no `.env` file.**

## Repo layout

```
src/routes/       file-based routes (TanStack Router)
src/lib/          domain logic — payments.ts, ledger-state.ts, arrears.ts,
                  paycheck-budget.ts, balances.ts, deduction-funding.ts, …
src/components/    shared UI (Radix-based primitives under ui/)
scripts/          test harness + hand-run SQL migrations
docs/             see below
```

`src/lib/*.ts` files are the single source of truth for each money formula;
`docs/ARCHITECTURE.md` maps which screens consume which module.

## Docs

| File | What |
|---|---|
| `CLAUDE.md` | agent working rules — **start here** |
| `docs/CONTEXT.md` | compact current-state briefing (phase list, locked decisions, rules) |
| `docs/DECISIONS.md` | every ADR (001–083+) |
| `docs/SCHEMA.md` | full schema + RLS policies |
| `docs/ARCHITECTURE.md` | module → screen map |
| `docs/CHANGELOG.md` | dated history |
| `docs/PLAN.md` | the original sequential build plan — historical |

Open work lives in **GitHub Issues** (labels `verification`, `tech-debt`, …);
phase progress is tracked with **Milestones**. `docs/TODO.md` keeps only
known-by-design limitations. The older `docs/AI_CONTEXT.md`, `AI Manual.md`,
`Claude Instructions.md`, and `CONTEXT_1.0.md` are superseded by `CLAUDE.md` +
`docs/CONTEXT.md`.

## Develop

Built to run in a **GitHub Codespace** (the devcontainer runs `npm ci`).

```bash
npm run dev         # dev server on http://localhost:8080
npm run build       # production build (.output/)
npm test            # vitest — 87 tests
npm run typecheck   # tsc --noEmit
```

Log in at `/auth`. Real household credentials are personal — for local work use
the test account (below).

### Database changes

Schema and data writes are run **by hand** in the Supabase SQL Editor (there is
no CLI/migration runner) — see the workflow loop in `CLAUDE.md`. A read-only
Supabase MCP server is wired for verification. Migration SQL is checked in under
`scripts/migrations/`.

### Testing against the database

Automated tests create and mutate data in **only** the "TEST Household — Lovable
QA" household — the boundary is Postgres RLS, not a code convention (see
**ADR-083**). All test DB access goes through `scripts/test-db.mjs`
(`testClient()`), which signs in as an RLS-bound test user and refuses to
proceed if it can reach anything else. Credentials live in a gitignored
`.env.test` at the repo root (`SMOKE_EMAIL` / `SMOKE_PASSWORD`).

Browser smoke tests: see `scripts/smoke/README.md`.

## Android / Google Play

Not started (Phases 12–13). Capacitor wrap, then Internal Testing.

## Privacy

This repo is **private**. Real financial data lives only in Supabase, behind
Row-Level Security — never in the repo. `.env*` files are gitignored. Don't
commit account numbers, passwords, or the `service_role` key.
