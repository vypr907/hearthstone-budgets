## ADR-077: "Correct This Payment" — In-Place Ledger Repair for Partial Payments (Extends ADR-037)

Decision:
New `useCorrectPayment` (`payments.ts`) and a "Correct this payment" action alongside
Reverse/Delete on a bill/debt's linked transactions (Bills/Debts/Everything Recent
Transactions). Lets a cleared, linked transaction's amount/date/account be edited in
place, but ONLY when both the original amount and the corrected amount are partial
payments toward the same still-open cycle (neither the stored `cycle_paid_to_date`
before the edit nor after it would meet/exceed the cycle's due amount — no resolve/roll
boundary is crossed in either direction). The payable's `cycle_paid_to_date` is adjusted
by the delta (`corrected − original`); the transaction row itself is updated in place,
not replaced.
If the correction would cross a resolve boundary (the original payment already resolved
the cycle, or the corrected amount newly would), the mutation throws with a message
pointing at Reverse + redo instead — that case isn't handled in v1.

`findStrandedBillPayments`/`findStrandedDebtPayments` and their repair panels
(`StrandedBillRepair`/`StrandedDebtRepair`) gain a second action, "Credit now," next to
the existing "Clean up" (delete-and-redo): applies the stranded transaction's
already-cleared amount to the payable via the same crediting path Submit/Clear uses
(`applyClearedPayment`), instead of deleting the row and asking the user to redo the
payment. The transaction itself is untouched — only the payable's counters catch up.
"Clean up" stays available for cases where the transaction itself is also wrong and
needs to be re-entered.

Reason:
ADR-037's addendum (2026-08-20) locked amount/status editing on linked transactions to
close the gap that caused the Beiers/Peacock stranded-payment bugs — correctly, since
unrestricted editing bypassing `applyClearedPayment` was the root cause. But that left no
way to fix a simple data-entry mistake (wrong amount/date/account on an otherwise-valid
partial payment) without deleting real ledger history and redoing it from scratch. The
partial-only restriction keeps this safe: adjusting `cycle_paid_to_date` by a delta is
unambiguous exactly when no due-date roll is involved; once a resolve is in play, later
transactions may already assume the rolled-forward state, and unwinding that safely needs
more than this ADR scopes — deferred rather than guessed at.
The stranded-repair "Credit now" addition is the same idea applied to a stranded
(never-credited) row: since nothing was ever credited, there's no delta to compute —
crediting the existing row via the normal payment path is strictly simpler and preserves
the real transaction instead of discarding it.

Extends: ADR-037.

Status: Decided 2026-08-21. Implemented 2026-08-21. No schema change.

