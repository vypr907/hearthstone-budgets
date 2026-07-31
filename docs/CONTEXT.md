## Project
Private shared household budget and debt-payoff Android application migrated from Google Sheets.

## Stack
- Lovable React/Vite frontend
- Self-managed Supabase PostgreSQL backend
- Supabase Auth + Row Level Security
- Capacitor Android wrapper
- Google Play Internal Testing

## Current Status
- Phase 0 complete: accounts, tools, repository
- Phase 1 complete: Core Data Model & Shared Login
- Phase 2 complete: Import Your Real Data (One-Time)
- Phase 3 complete: "Everything" View & Basic Dashboard
- Phase 3.5 complete: Pending/Cleared Status & Spendable Balance
- Phase 4 complete: Spending & Budget Tracking
- Phase 4.5 complete: Quick Transaction Entry & Running Balance
- Phase 5 complete: Debt Payoff Strategy Calculator
- Phase 6 complete: Payment Schedule & Charts
- Phase 7 not started: Wrap as a Real Android App (Capacitor)
- Phase 8 not started: Publish to Google Play (Internal Testing)
- Phase 9 not started: Cutover: Retire the Sheet
- Migration from Google Sheets has not occurred yet

## Locked Decisions
- Android only
- Two shared household users
- Household data is shared through household_id
- No Lovable Cloud backend
- Direct Supabase SQL Editor schema management
- One-time spreadsheet migration
- Bills and debts both carry billing_cycle + next_due_date; monthly debts still use due_day
- Combined spendable total counts credit accounts as available credit (ADR-023)
- Payment Schedule month check-offs are shared via payment_schedule_checkoffs

## Important Rules
- Never store passwords.
- Transactions are the ledger source of truth.
- Account balances use snapshots plus transactions after snapshot.
- Bills and debts remain synchronized with transaction records.
- account_type is always stored lowercase.
- Variable bills track cycle_amount_due / cycle_paid_to_date; a cycle only rolls forward when fully paid.
- Debts with known_finance_charge do not accrue interest_rate in payoff simulations.
- Credit accounts with no credit_limit are excluded from the combined spendable total and flagged on the Dashboard.