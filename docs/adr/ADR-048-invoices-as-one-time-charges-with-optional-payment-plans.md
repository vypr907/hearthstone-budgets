## ADR-048: Invoices as one-time charges with optional payment plans
Decision:
`debt_type = 'invoice'` is modelled as a real dated charge rather than a
recurring debt.
1. `billing_cycle` gains the value `one_time`. A one-time charge stores a real
   `next_due_date` (labelled "Due date" in the form) and no `due_day`; it never
   rolls forward — `advanceDate`/`shiftDate` return the same date, and
   `monthlyEquivalent` returns null.
2. Picking the Invoice type on a new debt defaults the cycle to `one_time`.
   The cycle stays user-editable, so an invoice can still be recurring.
3. The debt form always exposes both "Amount still owed" (`remaining_balance`)
   and "Original invoice amount" (`starting_balance`). Saving falls back to the
   remaining balance when the original is blank, so the not-null constraint on
   `debts.starting_balance` can never be tripped from the UI.
4. Payment plans are explicit: an `on_payment_plan` switch reveals
   `plan_payment_count` (nullable — "unknown" is valid) and
   `plan_final_payment` (nullable — "same amount" is valid). The instalment
   amount reuses `minimum_payment`, which the form relabels to "Payment amount"
   while a plan is on. No new payoff engine: existing cycle logic drives it.
5. Clearing a one-time charge sets `payment_status = 'cleared'` when the balance
   reaches zero and leaves the due date alone.

Reason:
An invoice is a single dated obligation, not a cycle. Forcing it into "Monthly
with the minimum set to the balance" loses the real due date and silently rolls
the due date forward on payment. Reusing `minimum_payment` for the instalment
avoids a parallel amount field and keeps the existing pay/cycle flow intact.

Status: Decided 2026-08-11. Implemented.


