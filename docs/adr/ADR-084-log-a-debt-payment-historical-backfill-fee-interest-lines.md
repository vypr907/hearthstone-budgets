## ADR-084: Log a Debt Payment (Historical Backfill + Fee/Interest Lines)
Decision:
Debt detail gains a "Log a payment to this debt" button opening a single form:
date, paying account, principal amount, status (cleared/pending), and any
number of fee/interest lines (type, amount, note). The payment date decides the
behaviour — a date inside the current cycle window (from one cycle before
`next_due_date` up to today/future) runs the normal `applyClearedPayment()`
path (cycle counters, payment_status, due-date roll, arrears overflow); an
earlier date is a historical backfill that only reduces `remaining_balance` and
writes the ledger row, leaving all cycle fields alone. Only the principal moves
the debt balance. Each fee/interest line posts its own transaction against the
same account (so account balances stay correct) but never touches
`remaining_balance` — no interest engine exists yet. All rows share one
`split_group_id` and every extra line's description is prefixed "Fee: " so the
existing ADR-046 paired-fee helpers (clear/delete) keep the group atomic.
Payable-first write ordering (ADR-037) is preserved, and the same out-of-order
backdating confirmation used by the Adjustments section applies.
Reason:
Backfilling old debt payments previously required the live pay flow, which
always applied the payment to the current cycle and rolled due dates for
payments made months earlier. Splitting principal from fees/interest in one
form matches how real statements arrive, and keeping fees ledger-only avoids
faking interest accrual against the balance.
Status: Decided 2026-08-26. Implemented.

Addendum (2026-09-04): **a historical payment on a `debt_type='advance'` debt
dated before that debt's most recent advance is ledger-only.** An advance debt
carries ONE running `remaining_balance` covering the current advance; earlier
advances are already settled, so subtracting a backdated repayment from the
balance (and, via `advanceMinimumPaymentPatch`, from `minimum_payment` / amount
due) corrupts the current draw — the symptom the user hit: logging a July
Instacash payment for account accuracy cut the live advance's balance.
`isPreAdvanceHistoricalPayment(debt, date, newestAdvanceDate)` (`src/lib/payments.ts`)
gates it; `useLogDebtPayment` skips the balance write when it's true and still
inserts the ledger row; `LogDebtPaymentDialog` loads `useDebtAdjustments`,
passes `newestAdvanceDate`, and swaps its hint/toast to say the balance won't
change. In-cycle payments and historical payments *after* the newest advance are
unaffected. Data cleanup for the pre-existing Instacash drift:
`scripts/migrations/2026-09-04-cleo-instacash-untangle.sql`.

Cross-note to **ADR-056**: `useCreateAdvance` now also sets `linked_debt_id` on
the advance's deposit transaction so it appears in the debt's Recent
Transactions next to repayments (still tagged `transfer_group_id` for
`useDeleteAdvance`). Because that row is a disbursement, not a repayment,
`isAdvanceDisbursement(t)` (`src/lib/payments.ts`) excludes it from
`deriveCycleInfo` cycle math, the Debt Strategy payment-history tally, and the
Correct/Reverse actions. Existing deposits backfilled by the same script.

Addendum (2026-09-04, Issue #57): **bill equivalent — "Log a payment to this
bill".** Bills had no historical-backfill path; the only options were the live
Submit/Clear flow (always applies to the current cycle) or the arrears-directed
`ArrearsPaymentAction`. Adding a missed past payment required raw SQL (the
2026-09-04 Cleo Plus 8/3 backfill). `LogBillPaymentDialog` +
`useLogBillPayment()` (`src/lib/payments.ts`) mirror the debt version's shape —
one form: date, paying account, amount, status — but simpler: bills carry no
running principal balance for a historical payment to reduce, and no fee/interest
lines (out of scope for this issue). The date decides behaviour via
`isWithinCurrentBillCycle(bill, date)` / `billCycleWindowStart(bill, today)`
(new, `src/lib/payments.ts`): a monthly bill's window is the *calendar month
containing `today`* per ADR-086 (resets on the 1st, independent of due day); a
non-monthly bill keeps the `next_due_date`-anchored rolling window (mirrors
`debtCycleWindowStart`, kept separate rather than shared since the debt version
predates ADR-086 and doesn't apply its calendar-month rule); a one-time bill
(ADR-048) has no historical concept — every date is in-cycle. An in-cycle date
runs the normal `applyClearedPayment()` path; an elapsed-cycle date writes a
plain `linked_bill_id` ledger row and leaves the bill's cycle fields untouched.
Rendered on the Bills detail panel next to `PastDueEditor`, same placement
pattern as the debt dialog. Tests: `isWithinCurrentBillCycle` /
`billCycleWindowStart` in `payments.test.ts` (monthly, non-monthly, one-time).

Addendum (2026-09-14): **revisiting "no fee/interest lines" — bill payments
now support them too.** The 2026-09-04 scope call above left bills unable to
record a fee alongside a payment except through the main pay-flow's Submit
dialog (ADR-046), not "Log a payment to this bill" — surfaced by a real case
(a Flex rent installment with its own fee, logged historically). Ported the
debt dialog's fee-line pattern: `DebtPaymentLine` is renamed `PaymentLine`
(`src/lib/payments.ts`, now shared), `LogBillPaymentInput` gains
`lines: PaymentLine[]`, and `useLogBillPayment` mirrors
`useLogDebtPayment`'s `extras` handling — a `split_group_id` groups the
payment row with any fee/interest rows, each fee row unlinked (`linked_bill_id`
stays null, so it's excluded from cycle credit, same as debt fee lines are
excluded from `remaining_balance`) and categorized via `feeCategoryId()`
(already shared, not duplicated). `LogBillPaymentDialog` gains the same
"Fees & interest" add/line UI as `LogDebtPaymentDialog`. No change needed to
group display/editing (`isPaymentWithFeesGroup`, `LinkedGroupDetail`) — both
already treat bill-linked and debt-linked payment+fee groups identically.
Verified end-to-end against the TEST household: a logged payment with a fee
line produced two rows sharing a `split_group_id`, the fee row unlinked and
categorized "Fees," rendering correctly in `LinkedGroupDetail`'s edit view.

Status: Decided 2026-09-14. Implemented (`src/lib/payments.ts`,
`src/components/LogBillPaymentDialog.tsx`, `src/components/LogDebtPaymentDialog.tsx`).

