## Session Notes

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
