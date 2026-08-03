## Overview
The application uses a layered architecture:

## Frontend
Lovable-generated React/Vite application provides:
- dashboards
- forms
- household views
- budget tracking
- debt payoff visualization

## Backend
Supabase provides:
- PostgreSQL database
- authentication
- authorization
- Row Level Security

## Data Ownership
Every household-owned table contains household_id.

## Security Model
Users authenticate individually but share identical household data.

## Mobile
Capacitor packages the web application as an Android application distributed through Google Play Internal Testing.
## Balances
src/lib/balances.ts is the single source of the account balance formula (anchor snapshot + cleared/pending transactions) and the spendable-account rules. Accounts and Dashboard both consume it.

## Spending actuals
src/lib/spending-actuals.ts resolves a category's monthly actual from the ledger first and the manual spending_actuals row second. Spending and Dashboard both consume it.

## Global quick actions
The /app layout renders a floating Add Transaction action alongside the bottom nav, available on every screen.

## Payment schedule
src/lib/payment-schedule.ts builds the forward-looking 12-month debt payment plan using the
same ordering/rollover rules as src/lib/debt-payoff.ts. The Payment Schedule screen consumes it.

## Net worth history
src/lib/net-worth.ts owns point-in-time account balances (snapshot-before-date + cleared
transactions since) and the account_type-grouped trend used by the Dashboard charts.

## Paycheck budgeting
src/lib/paycheck-budget.ts owns pay-period math: the effective date/amount of an income_event
(actual over expected), the period range (event date → next primary event, else +14 days), and
which bills/debts fall inside it (reusing debtDueDate() and bill next_due_date). The Paycheck
Budget screen consumes it; it is independent of spending_budgets/spending_actuals.
