# Product Context

Private household budget & debt-payoff Android app for 2 shared logins seeing
identical data. React/Vite frontend (built via Lovable, now paused — Kiro/local
work only until credits are restored), self-managed Supabase Postgres backend,
Capacitor Android wrapper, Google Play Internal Testing.

Do not suggest Lovable Cloud. Do not add password columns. Every household table
requires `household_id` + RLS via `is_household_member(household_id)`.

## Current phase
Phase 10 complete. Now in **Phase 11**: ledger correctness, money movement
(transfers/advances), overdue-aware payments, income deductions, and mobile
polish — see `phase-11-tasks.md`.

## Workflow (Lovable-less)
Diagnose → confirm/draft ADR → SQL migration (run manually in Supabase SQL
Editor) → implement in code locally → verify against live Supabase.
No migration files/CLI — schema is managed by hand in the SQL Editor.

## Repo conventions
- Lovable's GitHub sync is two-way. Always `git pull` before a local session;
  never run a Lovable prompt and a local edit session at the same time.
- `src/` is Lovable/app-owned code — safe for Kiro to edit directly while
  Lovable is paused. `android/` (once Phase 12 starts) is Capacitor-owned/external.
- Smallest correct change. Reuse existing modules/patterns before adding new
  ones (e.g. `debt_adjustments` reused for advances rather than a new table —
  see ADR-056).
