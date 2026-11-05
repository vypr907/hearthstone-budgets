## ADR-065: Bill/Debt Payment and Fee Transactions Default institution_id (Extends ADR-046, ADR-053)

Decision:
When writing a bill/debt payment transaction (ADR-035/036/037) or its paired fee
transaction (ADR-046), institution_id is set from the linked bill's or debt's own
institution_id (ADR-006), same moment the write already happens — no extra user
step. Manual Add Transaction entry (ADR-053) is unchanged: place still must be
picked/created there, since a plain transaction has no bill/debt to inherit from.

This is a default only, not a lock — the user can still change or clear the place
afterward via TransactionDetail edit (same as any other transaction).

Reason:
Bills and debts already know their institution; failing to carry it onto their
payment/fee transactions was an oversight from before institution_id existed on
transactions, not an intentional gap. It also means every bill/debt payment and
fee transaction was showing up in the "Fix Places" repair screen, which should
only be surfacing genuinely untagged manual spending.

Status: Decided 2026-08-14. Implemented 2026-08-14 (institution_id set from
the linked bill/debt in useMarkSubmitted, useMarkCleared's direct-clear
branch, and insertFeeTransaction, all in src/lib/payments.ts; one-time
backfill SQL written for existing null institution_id rows, pending manual
run in Supabase — see docs/TODO.md).

