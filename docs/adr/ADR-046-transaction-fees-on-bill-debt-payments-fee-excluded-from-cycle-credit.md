## ADR-046: Transaction Fees on Bill/Debt Payments (Fee Excluded from Cycle Credit)

Decision:
The bill/debt payment flow (pay-flow.tsx, ADR-035/036/037) gains an optional "fee"
field alongside the payment amount. Confirming a payment with a fee set writes TWO
transactions on the same account/date, not one:

1. The payment transaction: amount = the entered payment amount, linked_bill_id or
   linked_debt_id set as normal — this is the only row that credits
   cycle_paid_to_date / reduces remaining_balance, unchanged from ADR-035.
2. A fee transaction: amount = the fee, no linked_bill_id/linked_debt_id,
   category_id defaulting to the household's "Fees" category if one exists,
   description "Fee: <bill/debt name>".

Both rows debit the paying account, so the account's balance correctly reflects the
full amount that left it (e.g. $31.20), while only $30 counts toward the bill/debt's
payoff/cycle math. This applies to both fixed and partial payments (ADR-035) — the
fee is not part of "amount paid this cycle" in any case.

Reason:
A processing/late/NSF fee is real money leaving the account but isn't progress
against what's owed — crediting it to cycle_paid_to_date or remaining_balance would
make a bill or debt look more paid-off than it is, while omitting it from the account
debit would make the account balance wrong. Two unlinked-vs-linked rows on the same
account already solves an analogous problem in ADR-038 (Set Aside); reusing that
shape here avoids a third payment-fee mechanism and needs no schema change.

Scope note: distinct from ADR-045's debt_adjustments — that table changes
remaining_balance with NO account movement (insurance coverage, a late fee added to
what's owed). This ADR is the mirror case: real account movement that does NOT
change remaining_balance/cycle_paid_to_date. A late fee could be modeled either way
depending on whether it was actually paid out-of-pocket (this ADR) or just added to
the balance owed (ADR-045) — the household decides per fee, the mechanisms aren't
mutually exclusive.

Status: Decided 2026-08-10. Implemented 2026-08-11 (fee field in pay-flow.tsx; fee row
uses the household "Fees" category when one exists). Follow-up (2026-08-11):
`insertFeeTransaction` now auto-creates a "Fees" category if none exists, so fee
rows are always categorised rather than occasionally uncategorised.

**2026-10-16 addendum — Submit Payment gains itemized, multi-line fees (parity
with ADR-084's Log a Payment).** The single `fee` amount field is replaced with
N repeatable lines, each carrying a `type` (Fee / Interest / Late fee /
Processing fee / Tax / Other charge — "Tax" new, to match itemized receipts
e.g. a rent-to-own payment's non-renewal fee + protection plan + tax) and an
optional free-text `note`, reusing the exact `PaymentLine`/`LINE_TYPES` shape
ADR-084's "Log a Payment to this debt" already established — `LINE_TYPES`,
the `PaymentLineDraft` helper type, and `newPaymentLine()` move from being
duplicated in `LogDebtPaymentDialog.tsx`/`LogBillPaymentDialog.tsx` into
`src/lib/payments.ts` so all three fee-entry UIs (Submit Payment, Log a
Payment on a debt, Log a Payment on a bill) share one list. `PayInput.fee?:
number` becomes `PayInput.feeLines?: PaymentLine[]`; a new `insertFeeLines()`
generalizes `insertFeeTransaction()` from one amount to N lines, writing one
`"Fee: <name> · <type>[ — <note>]"` transaction per charged line, all sharing
one `split_group_id` with the payment (and each other) exactly as before —
`isFeeTransaction`/`clearPairedFees`/`deletePairedFees` only ever match the
`"Fee: "` prefix, so clear/undo/reset stay atomic regardless of line count.
`insertFeeTransaction()` itself is untouched and still used as-is by the
transfer-fee (ADR-097) and ATM-fee (ADR-110) paths, which are out of scope
here.

Status: addendum decided 2026-10-16. Implemented 2026-10-16 — `tsc --noEmit`
clean, 274/274 tests pass (no new pure logic — reuses the already-tested
`insertFeeTransaction`/`hasFee`/`feeCategoryId` shape). Not yet checked in a
running browser.

**2026-10-16 addendum — "Itemize this amount" (Base + Tax stay visible, both
still count toward the balance).** Some debts (e.g. a rent-to-own lease,
ADR-092) charge a recurring amount that already has a component like tax
rolled in — splitting that component out as its own `"Fee: "` line (the
previous addendum's Tax type) was the wrong tool, since Fee lines are
deliberately excluded from `cycle_paid_to_date`/`remaining_balance`
everywhere (this produced a real, confirmed shortfall on "Aarons - Dresser").
Submit Payment, Log a Payment on a debt, and Log a Payment on a bill each
gain an optional "+ Itemize this amount" control (`src/components/
ItemizeAmountFields.tsx`, shared by all three): repeatable `{label, amount}`
rows that sum into the *same single* linked payment transaction's amount
(the Principal/Amount field becomes read-only, showing the derived total)
and compose into that one transaction's own `description` — e.g. `"Debt
payment · Aarons - Dresser (Base $92.04, Tax $5.06)"` — via new
`itemizedAmountTotal()`/`composeItemizedDescription()` (`src/lib/
payments.ts`). `PayInput`, `LogDebtPaymentInput`, and `LogBillPaymentInput`
each gain an optional `description`/`principalDescription` override (default:
the existing hardcoded `"<Bill|Debt> payment · <name>"`), threaded into the
one existing linked-row insert in `useMarkSubmitted`, `useMarkCleared`, and
`useLogDebtPayment`/`useLogBillPayment` respectively — the ADR-102
mirror-account legs are untouched. No new transaction rows, no schema
change, no change to `findLinkedTransaction`/`useEditLinkedTransaction`/
`rollbackClearedPayment`/`applyClearedPayment`/`useResetCycle`/
`debtBalanceAsOf`/`computeAdvanceEpisodes`/`deriveCycleInfo` — still exactly
one linked transaction per payment, identical to every payment before this
addendum; only its description gains an optional parenthetical breakdown.
An itemized line that should instead be its own independently-categorized,
independently balance-affecting transaction was considered and rejected —
that requires every one of those "exactly one linked row" assumptions to be
audited first, real risk for a want that this lighter approach already
satisfies.

Status: addendum decided 2026-10-16. Implemented 2026-10-16 — `tsc --noEmit`
clean, 274/274 tests pass. Not yet checked in a running browser. The
"Aarons - Dresser" 2026-09-28 payment that prompted this (Tax split out as
its own Fee line, $5.06 short of `cycle_paid_to_date`) is corrected by hand
via the existing `LinkedGroupDetail` editor (ADR-091) — no new tooling
needed for that one row, since its Amount and Description fields were
already editable.

