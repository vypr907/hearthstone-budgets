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
