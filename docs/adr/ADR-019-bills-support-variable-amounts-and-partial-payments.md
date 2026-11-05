## ADR-019: Bills Support Variable Amounts and Partial Payments

Decision:
`bills.is_variable_amount` (boolean) gates whether marking a bill pending prompts for the
actual amount owed this cycle. `bills.cycle_amount_due` holds that cycle's real owed amount
when it differs from `bills.amount` (the bill's typical/budgeted figure, left unchanged).
`bills.cycle_paid_to_date` tracks cumulative cleared payments toward the current cycle.
A cycle only resolves (payment_status resets, next_due_date advances) once
cycle_paid_to_date >= cycle_amount_due; underpayment keeps the bill 'pending' and open for
a follow-up payment rather than silently closing the cycle.

Debts are unaffected: clearing a debt payment already reduces remaining_balance by the real
transaction amount (not a fixed minimum), so overpayment on debts already applies as extra
principal reduction with no schema change required — confirmed against Phase 3.5's original
spec.

Reason:
Bills had no way to represent "owed X, paid less than X, remainder still due" — payment_status
assumed one payment fully resolved a cycle. Variable bills (electric, phone) need both a
different amount each cycle and the ability to under-pay without losing track of the shortfall.

Status: Decided 2026-07-31. Implemented.

