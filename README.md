# Hearthstone

*A private, shared household budget & debt-payoff tracker — migrated from a Google Sheets workbook to a native Android app.*

> "Ledger" and the `com.yourhousehold.ledger` package ID are placeholders from the build plan — rename both to whatever you actually want to call it.

## What this is

A budget/debt app shared by 2 people who each log in separately but see the same household's data. It covers:

- Bills & debts, with real `unpaid → pending → cleared` payment status
- Spendable balance vs. current balance, per account
- Quick manual transaction entry for everyday spending (no bank connection — yet)
- Monthly budget vs. actual spending by category
- A debt payoff strategy calculator (Avalanche / Snowball / Custom)
- Net worth tracking over time

## Tech stack

| Layer | Tool |
|---|---|
| App / UI | [Lovable](https://lovable.dev) (React + Vite) |
| Database & Auth | [Supabase](https://supabase.com) (Postgres + Row-Level Security) |
| Native Android shell | [Capacitor](https://capacitorjs.com) |
| Distribution | Google Play (Internal Testing) |

## Status

**Current phase:** Phase 2 — Import your Real Data

Full phase-by-phase build plan, database schema, and the actual Lovable prompts used at each step live in [`PLAN.md`](./PLAN.md).

## Data model

Every table is scoped to a `household_id`, with Supabase Row-Level Security restricting each household to its own members — this is built for exactly 2 shared logins seeing identical data, not two separate personal accounts.

Core tables: `households`, `household_members`, `categories`, `accounts`, `account_balances`, `transactions`, `bills`, `debts`, `debt_strategy_settings`, `spending_budgets`, `spending_actuals`. Full column-level schema and the RLS policies are in `PLAN.md`.

## Getting started

Day-to-day changes to this app happen in the Lovable editor, not by hand-editing this repo. To run a local copy:

```bash
git clone <this-repo-url>
cd <repo-folder>
npm install
npm run dev
```

You'll need a local `.env` (never commit this file):

```
VITE_SUPABASE_URL=<your-supabase-project-url>
VITE_SUPABASE_ANON_KEY=<your-supabase-anon-key>
```

## Building for Android

```bash
npm run build
npx cap sync android
npx cap open android
```

Full Capacitor setup and Google Play publishing steps are in `PLAN.md`, Phases 7–8.

## Privacy

This repo — and the data behind it — is private household financial information. Keep the repo set to **Private** on GitHub, and never commit real account numbers, passwords, or `.env` files.

## License

Personal/household project — not licensed for reuse or redistribution.
