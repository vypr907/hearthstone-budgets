# Open items

## Phase 11 — In progress (2026-08-11)

- [ ] Run ADR-028 migration in Supabase: `alter table households add column export_format text not null default 'png' check (export_format in ('png','pdf'));`
- [X] Run ADR-061 RLS fix in Supabase (see docs/SCHEMA.md): add the `household_members` self-UPDATE policy + `grant update ... to authenticated` — without it theme saves silently do nothing.
- [X] Run ADR-061 migration in Supabase: `alter table household_members add column theme text not null default 'standard' check (theme in ('standard','halo','hellokitty','purple_dark','purple_pastel','cyber_neon','cyber_stealth'));` — until run, the Settings Theme picker will fail to save (column doesn't exist yet).
- [ ] Run ADR-065 backfill in Supabase (SQL script provided, not a migration file): sets institution_id on existing bill/debt payment and paired fee transactions where it is null, from the linked bill/debt. Until run, older payments keep showing up in Fix Places even though new payments now default their place correctly.
- [X] Verify clearing a bill/debt-linked pending payment from the new Pending screen rolls the due date and credits the cycle in the live app.
- [X] Redo any cleaned-up stranded debt payments through Submit / Mark cleared and confirm status, remaining balance, paid-this-cycle and next due date all advance.

## Phase 11 — Remaining groups

- [x] **Group 4**: Verify overdue-aware payment allocation (ADR-057) against a real multi-cycle-behind bill in the live app — pay via "Total due", confirm PastDueBadge disappears.
- [x] **Group 5**: Verify `debt_adjustments.affects_balance` column exists in live Supabase (column default `true` should have backfilled existing rows). Run `SCHEMA_MIGRATION_PHASE11.sql` if not already done for `bill_adjustments`.
- [x] **Group 5**: Confirm `bill_adjustments` table exists live; if not, run the relevant section of `SCHEMA_MIGRATION_PHASE11.sql`.
- [X] Update `docs/SCHEMA.md` and `docs/ARCHITECTURE.md`, and mark ADR-055..058 Implemented in `docs/DECISIONS.md`.
- [X] Commit and push all Phase 11 Group 2–7 changes.

## Phase 11 — Verification (2026-08-13)

- [x] Verify ADR-059: plan a payment on a future pay period, confirm the Planned card and "Left to allocate" reflect it.
- [X] Verify ADR-060: on the pay period ending 9/24, confirm recurring bills appear marked "Projected" one cycle after their current `next_due_date`.
- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.

## Phase 11 — Verification (2026-08-14)

- [x] Verify ADR-062/063/064 in the live app: manual transactions save as pending, the date field persists, Place and Description store separately, and a transfer's category lands on both rows.
- [ ] Work through Fix Places once the ADR-065 backfill has run, to confirm only genuinely place-less transactions remain.

## Phase 11 — Verification (2026-08-17)

- [ ] Verify ADR-066 in the live app: re-advance a paid-off advance-type debt (e.g. MoneyLion Instacash) and confirm it drops `date_paid_off`, reactivates, and un-hides from the debt list — same debt id, no duplicate row. Also confirm the debt Type picker saves "credit card" (not "credit_card") without tripping the DB check constraint. STILL HIDES
- [x] Verify ADR-067 in the live app: the Categories screen Parent Category field lists existing values as a dropdown, "+ Add new" lets you type and save a genuinely new one, and editing an existing category preselects its current parent.
- [x] Verify the ADR-053/063 manual-transaction-title change in the live app: a manual transaction with a place and no description shows the place alone as its title; with both set, shows "<Place> · <Description>" with the description visibly subdued; Fee/Bill payment/Debt payment titles are unchanged.

## Dashboard/UX polish pass — Lovable prompts ready (2026-08-18)

- [ ] Send item 1 (Dashboard grid cutoff + font sizing) to Lovable — root cause and exact fix are in SESSION.md/chat history for this date.
- [ ] Send item 2 (BudgetSplitLines shared component — dual ItemBar progress bars, Direction B) to Lovable.
- [ ] Send item 3 (Paycheck Budget floating "left to allocate" bar) to Lovable.
- [ ] Send item 4 (Transactions search v1: description/place text search + amountMin/amountMax range) to Lovable.
- [ ] Send item 5 (tooltip/help pass: hero metric, Available credit, Still owed vs Past due, Projected badge) to Lovable.
- [ ] Send item 6 (Dashboard reorder + collapsible Payoff Progress defaulting **closed**, binary Past Due deduction grouping) to Lovable. Note: only the binary (deduction-combined vs. other) grouping is buildable today — true Deduction-vs-HSA split needs the excluded Bucket C schema work.
- [ ] Send item 7 (Transfer mode helper text explaining no Place is needed) to Lovable.
- [ ] Send item 8 (Accounts Recent Activity rows clickable, reusing exported TransactionDetail) to Lovable.
- [ ] Bucket C follow-up (separate from this pass, ADRs being drafted elsewhere): once Deduction vs. HSA payment-source separation lands, revisit item 6's Past Due grouping to make it a true 3-way split.

## Standing open items

- [ ] Re-tag older transactions with a place (institution_id) so Spending by place totals are complete — can now be done from TransactionDetail edit mode (Group 7 Part 3 landed).
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
