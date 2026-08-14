# Open items

## Phase 11 — In progress (2026-08-11)

- [ ] Run ADR-028 migration in Supabase: `alter table households add column export_format text not null default 'png' check (export_format in ('png','pdf'));`
- [ ] Run ADR-061 migration in Supabase: `alter table household_members add column theme text not null default 'standard' check (theme in ('standard','halo','hellokitty','purple_dark','purple_pastel','cyber_neon','cyber_stealth'));` — until run, the Settings Theme picker will fail to save (column doesn't exist yet).
- [ ] Redo any cleaned-up stranded debt payments through Submit / Mark cleared and confirm status, remaining balance, paid-this-cycle and next due date all advance.

## Phase 11 — Remaining groups

- [ ] **Group 4**: Verify overdue-aware payment allocation (ADR-057) against a real multi-cycle-behind bill in the live app — pay via "Total due", confirm PastDueBadge disappears.
- [ ] **Group 5**: Verify `debt_adjustments.affects_balance` column exists in live Supabase (column default `true` should have backfilled existing rows). Run `SCHEMA_MIGRATION_PHASE11.sql` if not already done for `bill_adjustments`.
- [ ] **Group 5**: Confirm `bill_adjustments` table exists live; if not, run the relevant section of `SCHEMA_MIGRATION_PHASE11.sql`.
- [ ] Update `docs/SCHEMA.md` and `docs/ARCHITECTURE.md`, and mark ADR-055..058 Implemented in `docs/DECISIONS.md`.
- [ ] Commit and push all Phase 11 Group 2–7 changes.

## Phase 11 — Verification (2026-08-13)

- [ ] Verify ADR-059: plan a payment on a future pay period, confirm the Planned card and "Left to allocate" reflect it.
- [ ] Verify ADR-060: on the pay period ending 9/24, confirm recurring bills appear marked "Projected" one cycle after their current `next_due_date`.
- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.

## Standing open items

- [ ] Re-tag older transactions with a place (institution_id) so Spending by place totals are complete — can now be done from TransactionDetail edit mode (Group 7 Part 3 landed).
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
