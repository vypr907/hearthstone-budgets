## ADR-062: Manual Transactions Default to Pending, Not Cleared

Decision:
The Add Transaction dialog's default `status` changes from `'cleared'` to
`'pending'`. The status toggle remains user-editable at entry time. This
applies only to the plain Add Transaction flow — bill/debt payment
submission (ADR-035/036/046), income deposits (ADR-047/055), transfers and
advances (ADR-056) keep their existing statuses (pending-then-clear or
cleared-on-write, per their own ADRs), unchanged.

Reason:
Phase 3.5 established pending/cleared as a real state (spendable vs. current
balance), but the Add Transaction dialog still defaulted new rows to
cleared, silently skipping the pending step for manually-entered spending —
the most common entry path. Defaulting to pending makes the manual flow
match the behavior every other write path in the app already has, and keeps
spendable balance accurate the moment a transaction is logged rather than
whenever it's later confirmed against the bank.

Status: Decided 2026-08-14. Implemented 2026-08-14.

---

