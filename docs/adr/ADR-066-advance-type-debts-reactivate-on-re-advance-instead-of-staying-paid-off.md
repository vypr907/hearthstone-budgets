## ADR-066: Advance-Type Debts Reactivate on Re-Advance Instead of Staying "Paid Off"

Decision:
For debts where debt_type = 'advance', recording a new advance
(debt_adjustments row, adjustment_type='advance', affects_balance=true) via
the existing advance write path checks the target debt's date_paid_off. If
set, the same write clears date_paid_off and un-hides the debt — same debt
id, same history, continuing forward. No new debt record is created per
advance cycle. This check lives in the write path itself (not a display-time
inference), since it's a real state change worth persisting.

Other debt types keep today's behavior unchanged: reaching
remaining_balance = 0 stamps date_paid_off permanently, debt stays hidden.

debt_type becomes an enforced (checked) column instead of free text, stored
lowercase in the database — consistent with the existing account_type
convention (`account_type is always stored lowercase`). The app displays it
capitalized (title case) at render time, same pattern already used
elsewhere for lowercase-stored/display-formatted fields.

Reason:
Revolving advance products (MoneyLion Instacash and similar) routinely hit
$0 and get re-advanced days later as normal use, not as a new debt.
Enforcing debt_type gives the reactivation check something reliable to key
off — free text risked a casing/spelling mismatch (e.g. "Advance" vs
"advance") silently skipping reactivation.

Scope note: doesn't change ADR-056's advance-write mechanism itself or
ADR-035/036's payment/cycle logic — only adds the reactivation branch to the
existing advance write, plus the debt_type constraint.

Status: Decided 2026-08-14. Implemented 2026-08-17.

**2026-09-01 addendum — non-Advance payoff dates are a stored invariant:**
Every write that changes a non-Advance debt's `remaining_balance` also keeps
`date_paid_off` synchronized: a balance at or below $0.005 has a payoff date,
and a balance above that threshold clears it. Payment and historical-payment
writes use the transaction date; adjustments use the adjustment date; other
writes fall back to the action date. Advance debts remain exempt because a zero
balance is their normal reusable state and ADR-066 owns their reactivation.

The database trigger `trg_sync_debt_date_paid_off` enforces the same invariant,
preventing imports or future write paths from creating another zero-balance
non-Advance debt without a payoff date. The 2026-09-01 migration repairs
existing rows using the latest linked cleared transaction date, falling back to
the migration date when no payment history exists.

Reason:
Everything correctly filtered on the stored payoff date, but legacy/imported
and adjustment-driven zero balances could lack that date and therefore remain
visible forever. Fixing the persisted lifecycle state, rather than adding a
display-only inference, keeps all aggregates and filters consistent.

Status: Decided 2026-09-01. Implemented in code; database migration pending
manual execution (`scripts/migrations/2026-09-01-enforce-debt-payoff-date.sql`).

