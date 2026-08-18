# ADR-068 — Deduction-funded bill/debt auto-payment

## Step 1 findings (verified in code)

- **Mark paycheck received** lives in `src/lib/income-hooks.ts` → `useMarkIncomeReceived()`. It:
  1. Updates the `income_events` row to `status: 'received'` with `actual_amount` / `actual_date`.
  2. Guards idempotency by checking for any transaction with `split_group_id = event.id` and returning early if found.
  3. Builds net split deposit rows from `income_source_splits` (fixed rows, then a `remainder` row), or a single fallback deposit into a caller-chosen account when no splits resolve.
  4. Appends one deposit row per deduction from `income_source_deductions` that has a `destination_account_id`; percent deductions are computed against the event's `actual_amount` (matches ADR-055). Reporting-only deductions are skipped.
  5. Inserts all rows in a single `transactions` insert, all sharing `split_group_id = event.id`.
- **Cycle derivation**: `deriveCycleInfo(payable, transactions, today)` in `src/lib/ledger-state.ts` returns `{ state, due, clearedSum, remaining, transactions, pending, resolved }`. Due amount comes from `billCycleDue()` / `debtCycleDue()` in `src/lib/payments.ts`.
- **Applying a payment**: `applyClearedPayment(payable, amount)` in `src/lib/payments.ts` is the single writer that credits `cycle_paid_to_date`, rolls `next_due_date`, sets `payment_status`, handles debt balances/`date_paid_off`, and applies ADR-057 arrears overflow. It uses the `updateRow()` guard (payable-first, throws on 0 rows) per ADR-037.
- **Types**: `Bill` / `Debt` in `src/lib/supabase.ts` do **not** yet have `funding_deduction_id`, and there is no `deduction_payment_events` type or hook. `IncomeSourceDeduction` already exists with `destination_account_id`.
- **Past Due** is inline in `src/routes/app.index.tsx` (`overdue` list, `OverdueRow`, already split into deduction vs rest groups) — the component exists, so only the label read is needed.

Difference from the ADR text worth noting: deduction deposits are inserted in the **same batch** as the split deposits, so linking a bill/debt payment to "the deduction's deposit transaction" means selecting the inserted row back by `split_group_id` + account + amount, or inserting the deduction rows with `.select()` so their ids are known.

## Step 2 — Auto-pay funded bills/debts

In `useMarkIncomeReceived`, after the existing insert (changed to `.select("id, account_id, amount, description")` so ids are known — behavior of the existing rows otherwise unchanged):

- Load bills and debts for the household where `funding_deduction_id` is in the set of deduction ids that have a `destination_account_id`.
- Load transactions once for cycle derivation, call `deriveCycleInfo()` per payable with today's date (no new date logic).
- For each matched payable:
  - `state` is `unpaid`/`pending`/`partial` → link the deduction's deposit transaction to the payable (`linked_bill_id`/`linked_debt_id`, keeping `split_group_id = event.id`) and call `applyClearedPayment(payable, deductionAmount)` first, per ADR-037 payable-first ordering.
    - If `Math.abs(due - deductionAmount) > 0.005`, still mark it paid (deduction is authoritative) and insert a `deduction_payment_events` row with `event_type: 'mismatch'`, `expected_amount = due`, `actual_amount = deductionAmount`.
  - `state` is `cleared` → touch nothing; insert a `deduction_payment_events` row with `event_type: 'already_paid_noop'`.
- Only the current cycle is touched; no future-cycle pre-pay.
- New helper module `src/lib/deduction-funding.ts` holds the matching + event-logging logic so the hook stays readable; types for `funding_deduction_id` and `DeductionPaymentEvent` added to `src/lib/supabase.ts`.
- Query invalidation extended to bills/debts so the UI reflects the auto-payments.

## Step 3 — Write-path validation

In the bill and debt edit forms (`src/routes/app.bills.tsx`, `src/routes/app.debts.tsx`), expose a "Funded by deduction" picker listing the household's income source deductions. On save, block when the selected deduction has no `destination_account_id`, with an inline error: reporting-only deductions can't fund a bill or debt because there is no transaction to attach the payment to. Reporting-only entries are shown disabled in the picker as well.

## Step 4 — Past Due label

In `src/routes/app.index.tsx`, where the overdue rows are built, when a bill/debt has `funding_deduction_id` resolve the deduction → `destination_account_id` → account, and render a small badge: "HSA-funded" when the account is excluded from net worth (or its institution/name indicates an HSA-type account), otherwise "Deduction-funded". No label when `funding_deduction_id` is null — existing behavior unchanged. No other Past Due restructuring.

## Docs

`docs/SESSION.md` bullet, `docs/SCHEMA.md` updated with the already-applied columns/table, `docs/DECISIONS.md` appended under **ADR-068** (no new ADR number), `docs/TODO.md` adjusted.
