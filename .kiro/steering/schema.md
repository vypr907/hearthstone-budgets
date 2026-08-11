# Schema Context

Full schema lives in the repo's `docs/SCHEMA.md` — read that first for anything
not covered here. This file only calls out what's new/relevant for Phase 11.

## Core tables (unchanged)
households, household_members, categories, institutions, accounts,
account_balances, transactions, bills, debts, debt_strategy_settings,
spending_budgets, spending_actuals, savings_goals, income_sources,
income_events, income_source_splits, pay_period_allocations, debt_adjustments,
payment_schedule_checkoffs.

## Balance/ledger rules (do not change without an ADR)
- Account balance = latest `account_balances` snapshot (or `starting_balance`)
  + transactions after that snapshot. Current = cleared only. Spendable =
  cleared + pending.
- `transactions` is the single ledger source of truth (ADR-003). Never add a
  parallel payment/ledger table.
- `split_group_id` tags rows belonging to one logical event (splits, fee
  pairs, now transfers via a *separate* `transfer_group_id` column — see below).

## Phase 11 schema additions (PENDING — do not assume these exist until the
migration in `SCHEMA_MIGRATION_PHASE11.sql` has actually been run in Supabase)

- `income_source_deductions` (new table) — ADR-055
- `transactions.transfer_group_id uuid` — ADR-056
- `bill_adjustments` (new table, mirrors `debt_adjustments`) — ADR-058
- `debt_adjustments.affects_balance boolean default true` — ADR-058
- No new columns for ADR-057 (overdue-aware allocation) — it reuses
  `bills/debts.opening_arrears` and `arrears_as_of` (ADR-049).

Guard any code touching these fields the same way ADR-048/049 code guards
its new columns: drop the field from the save payload if the write fails,
so the app still works pre-migration.

## Known schema drift
`account_type` is stored lowercase (ADR-022) — some docs show capitalized
examples; trust the ADR, not the doc prose, if they conflict.
