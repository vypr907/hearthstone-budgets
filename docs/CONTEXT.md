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
- Phase 1 in progress: Supabase schema and Lovable connection
- Phase 2 in progress: CSV cleanup/import preparation
- Migration from Google Sheets has not occurred yet

## Locked Decisions
- Android only
- Two shared household users
- Household data is shared through household_id
- No Lovable Cloud backend
- Direct Supabase SQL Editor schema management
- One-time spreadsheet migration

## Important Rules
- Never store passwords.
- Transactions are the ledger source of truth.
- Account balances use snapshots plus transactions after snapshot.
- Bills and debts remain synchronized with transaction records.