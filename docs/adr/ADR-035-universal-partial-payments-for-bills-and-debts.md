## ADR-035: Universal Partial Payments for Bills and Debts
Decision:
Every bill and debt submit/clear prompts for the amount being paid now, defaulting to
what is still owed this cycle and editable down for a partial payment. Bills fix
`cycle_amount_due` on the first payment of a cycle (variable bills via the existing
"what's owed this cycle" prompt, fixed bills automatically from `bills.amount`). Debts
gain `cycle_paid_to_date`, mirroring bills: a cleared payment credits the cycle and
reduces `remaining_balance` by the real amount paid; the cycle only resolves (reset
counters, advance non-monthly due dates) once `cycle_paid_to_date >= minimum_payment`,
otherwise the item stays pending and Submit stays available for a follow-up payment.
Cycle crediting lives in one shared `applyClearedPayment()` helper, also used by manual
transactions linked to a bill or debt.
Reason:
Real payments are frequently partial, and the old flow made a pending item's Submit
button a no-op and only prompted for variable bills, so follow-up payments could not be
recorded and cycles resolved on the first payment regardless of amount.
Status: Decided 2026-08-05. Implemented.
Notes: monthly debts have no `next_due_date` to roll, so a resolved monthly cycle keeps
`payment_status = 'cleared'` rather than resetting to 'unpaid'.

