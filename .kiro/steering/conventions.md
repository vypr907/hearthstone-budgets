# Conventions

## Never
- Rename schema objects without explicit approval.
- Store passwords anywhere in the database.
- Duplicate ledger/payment functionality — everything money-related is a
  `transactions` row (ADR-003).
- Rewrite working code unnecessarily, or change architecture silently.
- Assume a Phase 11 schema field (see `schema.md`) exists without verifying —
  guard writes so the app degrades gracefully pre-migration, per the existing
  ADR-048/049 pattern.

## Always
- Smallest correct change; reuse existing modules (`src/lib/balances.ts`,
  `src/lib/arrears.ts`, `src/lib/payments.ts`, `src/lib/ledger-state.ts`,
  etc.) instead of writing parallel logic.
- `git pull` before starting a session; don't edit while a Lovable prompt
  might be running concurrently (Lovable is currently paused, but resume this
  discipline once credits return).
- Flag any request that implies a schema/architecture change instead of
  quietly implementing it — surface it as a question, matching how ADRs are
  drafted before implementation in this project.
- `account_type` always lowercase; `billing_cycle`/`manual_or_auto` always
  lowercase (ADR-022, ADR-042).

## SQL
UUID primary keys, `created_at`/`updated_at` timestamps, `household_id` +
RLS on every household table, descriptive snake_case names. No migration
files/CLI — hand-run SQL in the Supabase SQL Editor, documented in
`docs/SCHEMA.md` afterward.
