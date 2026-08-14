# Open items

## Phase 11 — In progress (2026-08-11)

- [ ] Run ADR-028 migration in Supabase: `alter table households add column export_format text not null default 'png' check (export_format in ('png','pdf'));`
- [ ] Run ADR-061 RLS fix in Supabase (see docs/SCHEMA.md): add the `household_members` self-UPDATE policy + `grant update ... to authenticated` — without it theme saves silently do nothing.
- [ ] Run ADR-061 migration in Supabase: `alter table household_members add column theme text not null default 'standard' check (theme in ('standard','halo','hellokitty','purple_dark','purple_pastel','cyber_neon','cyber_stealth'));` — until run, the Settings Theme picker will fail to save (column doesn't exist yet).
- [ ] Run ADR-065 backfill in Supabase (SQL script provided, not a migration file): sets institution_id on existing bill/debt payment and paired fee transactions where it is null, from the linked bill/debt. Until run, older payments keep showing up in Fix Places even though new payments now default their place correctly.
- [ ] Verify clearing a bill/debt-linked pending payment from the new Pending screen rolls the due date and credits the cycle in the live app.
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

## Phase 11 — Verification (2026-08-14)

- [ ] Verify ADR-062/063/064 in the live app: manual transactions save as pending, the date field persists, Place and Description store separately, and a transfer's category lands on both rows.
- [ ] Work through Fix Places once the ADR-065 backfill has run, to confirm only genuinely place-less transactions remain.

## Standing open items

- [ ] Re-tag older transactions with a place (institution_id) so Spending by place totals are complete — can now be done from TransactionDetail edit mode (Group 7 Part 3 landed).
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
