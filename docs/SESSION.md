## Session Notes

- Data-only correction (no ADR — one-off backfill, not a schema/business-rule
  change): DFAS paycheck event `62d5c1d9-...` was marked received (ADR-047)
  before its income source had `income_source_deductions` rows for TSP Loan 1
  ($295.57) / TSP Loan 2 ($55.94) configured, so `useMarkIncomeReceived`'s
  idempotency guard (`income-hooks.ts:184-191`, keyed on any transaction
  already sharing the event's `split_group_id`) permanently closed that
  event's window to auto-post them once a manual single-deposit transaction
  existed for it — confirmed via code read, `hasUsableSplits()`/`receive()`/
  `confirmDeposit()` call sites, and live Supabase queries; no in-app path
  (including the "Post deposits" backfill button, gated by the same guard)
  can retroactively trigger ADR-055/068 posting for an already-received
  event. Manually replicated both halves by hand via Supabase SQL Editor:
  (1) two deposit transactions into `f1142b94-...` (TSP loan
  destination_account_id), `status='cleared'`, `split_group_id` = the
  paycheck event's id so they group in the ledger UI, `linked_debt_id` set —
  matching the shape `income-hooks.ts:300-308` + `deduction-funding.ts:
  129-137` would have written; (2) settled each debt's current cycle per
  `applyClearedPayment`'s debt branch (`payments.ts:136-189`) by hand: TSP
  Loan (`6b1fbc66-...`) remaining_balance 14788.84→14493.27, TSP Loan 2
  (`08f5ba5e-...`) 3000.00→2944.06, both cycle_paid_to_date reset to 0.
  Mid-correction, discovered/fixed a data error: both debts' `billing_cycle`
  had been (re)set to `biweekly` — corrected to `monthly` (their actual
  cycle) with `due_day=15`, `next_due_date=null` (monthly debts derive their
  displayed due date live from `due_day` via `debtDueDate()` in `format.ts:
  54-62`, not from `next_due_date`), `payment_status='cleared'`.
  Known issue surfaced (not fixed, no ADR — existing ADR-049 behavior, not
  new): `computeArrears()` (`arrears.ts:51-94`) ignores `payment_status`
  entirely for monthly debts — it recomputes "due date" live as `due_day`
  within the current calendar month and walks `cycle_paid_to_date` vs. the
  due amount, so any monthly debt cleared after its `due_day` has passed
  this month shows "1 cycle past due" via `PastDueBadge` regardless of
  `payment_status='cleared'`. Not specific to this manual entry — the real
  `applyClearedPayment` code path would produce the same badge for any
  monthly debt paid late-in-month, since it also resets `cycle_paid_to_date`
  to 0 without touching `next_due_date`/`due_day`. Worked around per-debt via
  `arrears_as_of` (exists exactly for this — `arrears.ts:78`, cycles on or
  before it don't count): set to 2026-08-19 on both TSP debts, which
  resumes normal arrears tracking from September onward without masking
  future missed cycles. Files touched: none (data-only, via SQL Editor).
  Next: none outstanding for this correction; flag the `computeArrears`/
  monthly-`payment_status` gap for a future ADR-049 follow-up if it recurs
  on other monthly debts.

- Implemented ADR-072 (app side): `PlanPaymentDialog` (`app.paycheck.tsx`,
  already bill/debt-only, so category/goal rows are unaffected by
  construction) gains an optional "Fee amount" field alongside the existing
  Planned amount. Added `PayPeriodAllocation.fee_amount` (`src/lib/
  supabase.ts`), forwarded through `useSetAllocation`'s new `feeAmount` arg
  (`src/lib/income-hooks.ts`) and `commitPlanned`. The Planned row shows
  "$total ($base + $fee fee)" when a fee is set, plain "$total" otherwise —
  `amount` keeps its existing total-outflow meaning, so ADR-071's
  Left-to-allocate math needed no changes. SQL migration (`alter table
  pay_period_allocations add column fee_amount numeric(12,2)` +
  `notify pgrst, 'reload schema'`) reported to the user to run manually —
  not run by this session (no DB access). Files touched: `src/lib/
  supabase.ts`, `src/lib/income-hooks.ts`, `src/routes/app.paycheck.tsx`.
  Next: user to run the SQL, then verify live (see TODO.md).

- Implemented ADR-071 (amends ADR-059, no new ADR): fixed Left-to-allocate
  double-subtracting a bill/debt that has both an auto-matched "Due this
  period" row and a manually planned `pay_period_allocations` row for the
  same period. Traced the calculation first: `obligationsTotal`
  (`src/routes/app.paycheck.tsx`) was a plain `sum()` over every
  `obligationsInRange()` row, with no awareness of planned rows at all.
  Added `obligationsTotalExcludingPlanned()` (`src/lib/paycheck-budget.ts`)
  and a `plannedKeys` set (bill/debt ids with a planned row for *this*
  period specifically, not globally) to exclude those items' due-date
  amount from the total. `obligations` (the "Due this period" list, unchanged
  per-item) and `planned`/`plannedTotal`/`allocated` are untouched — only
  the aggregate total feeding `left` and the "Obligations total" footer
  changed. Recurrence projection (ADR-060) and the visual Due/Planned
  section split (ADR-059) not touched. Files touched:
  `src/lib/paycheck-budget.ts`, `src/routes/app.paycheck.tsx`. Next: user
  to verify live (see TODO.md).

- ADR-056 addendum (interviewed the user to confirm scope — no free guessing):
  fixed the EarnIn/advance-type debt bug where minimum payment, still owed
  this cycle, remaining balance, and next due date all stayed blank after
  recording an advance. Root cause (traced, not assumed): `useCreateAdvance`
  only ever wrote `remaining_balance`; nothing else in the app ever set
  `minimum_payment` or `next_due_date`. Added `advanceMinimumPaymentPatch()`
  (`src/lib/payments.ts`) — for `debt_type='advance'`, `minimum_payment`
  always mirrors `remaining_balance` — and merged it into all 6 debt
  balance-writing sites (`useCreateAdvance`, `useDeleteAdvance`,
  `useAddDebtAdjustment`, `useDeleteDebtAdjustment`,
  `applyClearedPayment`'s and `useReversePayment`'s debt branches) so the
  invariant can't drift from any one path.
  Added `nextPayDate()` (`src/lib/paycheck-budget.ts`), keyed off the
  primary income source's events, as a one-time smart default for Next due
  date on biweekly advance-type debts — wired into the Add/Edit Debt form
  (`chooseType`/`chooseCycle` in `app.debts.tsx`, via a new `nextDueTouched`
  flag matching the existing remaining/minPay-touched pattern) and as a
  fallback in `useCreateAdvance` when a new advance is recorded against a
  debt with no due date yet. Never overwrites an existing/touched value —
  no ongoing resync, scoped to `debt_type='advance'` + `billing_cycle=
  'biweekly'` only.
  The original "$0.00 instead of $100" remaining_balance symptom could not
  be reproduced from a code read — the write path is correct as written.
  Flagged for the user to retry the advance now that the sync fix is in and
  report back if it still doesn't land.
  Files touched: `src/lib/payments.ts`, `src/lib/paycheck-budget.ts`,
  `src/lib/data-hooks.ts`, `src/routes/app.debts.tsx`. Next: user to verify
  live (see TODO.md).

- Bug fix (no ADR — referenced this session's finding, ADR-008 correcting/
  reversal transactions): `deriveCycleInfo()` in `src/lib/ledger-state.ts`
  summed `Math.abs(amount)` across cleared transactions for both `clearedSum`
  and `clearedPrev`, which double-counted an ADR-008 correcting/reversal
  transaction instead of netting it against the original payment it offsets.
  Replaced both with a signed net (`s - Number(t.amount ?? 0)`, floored at 0
  via `Math.max(0, ...)`). Added a regression test in
  `src/lib/ledger-state.test.ts`: a $609 cleared payment followed by a $609
  cleared reversal now nets `clearedSum = 0` and `state = 'unpaid'`, not
  `'cleared'`. Did not touch the `pastDue`/cycle-window filtering logic
  (out of scope). Files touched: `src/lib/ledger-state.ts`,
  `src/lib/ledger-state.test.ts`. Could not run the test suite locally
  (vitest binary blocked by AppLocker, per project constraint) — flagging
  for verification. Next: none outstanding for this task.
