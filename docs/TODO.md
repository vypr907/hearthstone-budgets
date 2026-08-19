# Open items

## Pending manual SQL (Supabase SQL Editor)

- [x] ADR-028: `alter table households add column export_format text not null default 'png' check (export_format in ('png','pdf'));`
- [ ] ADR-065 backfill (script, not a migration file): set `institution_id` on existing bill/debt payment and paired fee transactions where null, from the linked bill/debt. Until run, older payments keep appearing in Fix Places.
- [x] ADR-069: extend `categories.domain` to allow `'income'` and insert the four income categories (Income, Credit, Refund, Gift). Until run, Add Transaction's Income mode shows an empty category list.
- [ ] ADR-072: `alter table pay_period_allocations add column if not exists fee_amount numeric(12,2);` then `notify pgrst, 'reload schema';`. Until run, saving a Fee amount on "Plan a payment" will fail — the app-side write already sends `fee_amount`.

## Verification

- [ ] ADR-066: re-advance a paid-off advance-type debt (e.g. MoneyLion Instacash) and confirm it drops `date_paid_off`, reactivates and un-hides — same debt id, no duplicate row. Also confirm the Type picker saves "credit card" without tripping the check constraint. **STILL HIDES.** Note: `useCreateAdvance` was touched again 2026-08-19 (minimum_payment/next_due_date sync, unrelated to this bug) — re-check against current code before diagnosing.
- [ ] ADR-056 addendum (2026-08-19): record a real advance against a biweekly `debt_type='advance'` debt with no due date yet (e.g. EarnIn) and confirm minimum payment, still owed this cycle, remaining balance, and next due date all populate correctly — minimum payment should equal remaining balance, next due date should land on the household's actual next paycheck. Also re-test the original reported case: if remaining_balance still doesn't update after this fix, that points to something beyond the write-path bug found here (data/live-only issue) and needs a live Supabase check, not another code read.
- [ ] ADR-068: mark a paycheck received with a deduction that funds a bill/debt; confirm the current cycle settles, the deposit transaction is linked, and mismatch / already-paid cases log `deduction_payment_events` rows.
- [ ] ADR-070: reverse a cleared bill payment and a cleared debt payment; confirm cycle paid-to-date, payment status, remaining balance and `date_paid_off` all roll back and the offsetting transaction appears.
- [ ] ADR-069: after the migration, confirm Income mode saves a positive transaction with an income category and that income categories never appear in budget grids or the budget category picker.
- [ ] ADR-071 (2026-08-19): plan a payment for a bill/debt that's also due-date-matched in "Due this period" for the same pay period, and confirm "Obligations total" / Left-to-allocate only count it once (via the Planned amount), while the "Due this period" line item itself is still shown at its full due-date amount, unchanged.
- [ ] Work through Fix Places once the ADR-065 backfill has run, to confirm only genuinely place-less transactions remain.
- [ ] ADR-072: after the migration, plan a bill/debt payment with a Fee amount and confirm the Planned row shows "$total ($base + $fee fee)"; confirm a plan with no fee still shows just the plain total.

## Tests

- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.
- [ ] Fix the pre-existing `arrears.test.ts` opening-arrears failure (unrelated to recent work, still red).
- [ ] Run the suite (blocked locally by AppLocker) to confirm the new `ledger-state.test.ts` ADR-008 netting regression test passes, and verify live: reverse a cleared bill payment, confirm the bill's cycle state drops back to `unpaid`/`partial` instead of staying `cleared`.

## Follow-up work

- [ ] Revisit Past Due grouping as a true 3-way split now that ADR-068 labels rows Deduction-funded vs HSA-funded — the grouping itself is still binary (`debts.is_paycheck_deduction` only; bills have no equivalent field).

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
