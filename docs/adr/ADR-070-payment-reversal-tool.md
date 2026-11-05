## ADR-070: Payment Reversal Tool

Decision:
A "Reverse" action on any cleared transaction with linked_bill_id or linked_debt_id set,
shown in the "Recent transactions" section on Bill/Debt detail (same location as the
existing delete button, ADR-037). Only offered when status = 'cleared', a link is set, and
amount < 0 (an actual payment, not a fee or manual entry).

Confirming a reversal, in order:
1. Update the payable BEFORE writing the reversal row (payable-first pattern, ADR-037):
   - Bills: cycle_paid_to_date = greatest(0, cycle_paid_to_date - abs(original.amount)).
     If the result is less than (cycle_amount_due ?? amount), also set payment_status = 'unpaid'.
   - Debts: remaining_balance += abs(original.amount); cycle_paid_to_date =
     greatest(0, cycle_paid_to_date - abs(original.amount)); same payment_status reset rule;
     if date_paid_off was set, clear it (reactivation, mirrors ADR-066).
2. Insert a new transaction: same account, amount = -original.amount (sign-flipped, money
   returns), status = 'cleared', same linked_bill_id/linked_debt_id, description
   "Reversed: <bill/debt name> payment", transaction_date = user-supplied date (default today).

No schema change — reuses the existing unlinked/linked transaction pattern (same shape as
the fee mechanism, ADR-046).

Reason:
ADR-008 established that Undo is for accidental same-session clicks only — a genuinely
bounced/returned payment is real money movement that reversed and needs its own auditable
correcting transaction, not a rollback. The greatest(0, ...) clamp on cycle_paid_to_date
means the same code path is correct whether or not the bill/debt's cycle already rolled
forward past the bounced payment: if it already rolled (cycle_paid_to_date reset to 0), the
subtraction is a no-op and only the account-balance correction applies; if it hasn't rolled
yet, the subtraction actually reopens the cycle. No "which case are we in" branch needed.

Risk (accepted): reversing a stale, non-most-recent payment on a bill/debt that has since
had further cycles is allowed but will read confusingly in the ledger. Not blocked — flagged
in code as a comment.

Status: Decided 2026-08-18. Not yet implemented.

