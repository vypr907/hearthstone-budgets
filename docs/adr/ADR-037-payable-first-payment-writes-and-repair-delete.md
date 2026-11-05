## ADR-037: Payable-First Payment Writes and Repair Delete
Decision:
Submit and Clear write the bill/debt row before writing the ledger row, and every
bill/debt payment update goes through `updateRow()`, which uses `.select("id")` and throws
if no row changed. Ledger rows linked to a bill/debt can be deleted from the bill/debt
detail view via `useDeleteLinkedTransaction()` (repair only — the payable is untouched).

Reason:
A missing `debts.cycle_paid_to_date` column made the payable update fail after the ledger
write had already succeeded, leaving extra/cleared transactions with a debt whose status,
remaining balance, cycle paid and due date never moved. Ordering the payable write first
makes that failure mode a clean no-op, verified updates turn silent 0-row writes into
visible errors, and the repair delete lets the user clean up rows stranded by earlier
failures without hand-editing the database.

A repair scan (`findStrandedDebtPayments()` / `StrandedDebtRepair`, on the Debts screen)
lists debts whose current cycle has cleared ledger rows while `cycle_paid_to_date` is
still 0 and the cycle never resolved — the exact pre-fix symptom — and deletes those rows
so the payment can be redone through the normal Submit / Mark cleared flow.

Extends: ADR-035, ADR-036.

Status: Decided 2026-08-05. Implemented 2026-08-05.

### Addendum (2026-08-20): bill-side repair tool, and closing the Transactions-edit hole

A second cause of the same symptom was found on bills: the generic Transaction edit
dialog (Transactions screen) let a linked row's `amount`/`status` be changed via plain
`useUpsertTransaction()`, bypassing `applyClearedPayment()` entirely. Flipping a linked
transaction from pending to cleared there (or editing its amount) left the ledger showing
money cleared while `bills.cycle_paid_to_date` never moved — same stranded-payment
symptom as the original ADR-037 bug, different root cause (a UI gap, not a write-order
race).

Fix:
1. `TransactionDetailDialog`'s edit form now disables `amount` and `status` whenever the
   transaction is linked (`linked_bill_id`/`linked_debt_id` set), with a note pointing to
   the bill/debt's own Pay actions or Reverse. Date/description/account/category/place
   stay editable — only the two fields that drive cycle math are locked.
2. `findStrandedBillPayments()` / `StrandedBillRepair` (`src/components/StrandedBillRepair.tsx`)
   mirrors the debt-side repair scan for bills, mounted on the Bills screen. It flags a
   bill whose current-cycle cleared ledger sum exceeds `cycle_paid_to_date` (not just
   stuck at exactly 0, since a partial edit can desync it to any value) and offers the
   same delete-and-redo repair.

Extends: ADR-037.

Status: Decided 2026-08-20. Implemented 2026-08-20.

