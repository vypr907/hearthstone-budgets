# SESSION.md

- Post-migration verification for the debt payoff-date invariant (ADR-066 addendum).
  Added `scripts/migrations/2026-09-01-enforce-debt-payoff-date.verify.sql` (read-only
  checks: trigger + function installed, no settled non-Advance debt missing
  `date_paid_off`, no open non-Advance debt still carrying one, backfill spot-check,
  Advance rows informational). Unit tests pass (21) and build is clean.
  - Known issue: this environment has no direct connection to the self-managed
    Supabase project, so the checks must be run via the read-only MCP / SQL Editor.
  - Next step: user runs the verify script; if checks 3 or 4 return rows, investigate
    the write path that produced them.
