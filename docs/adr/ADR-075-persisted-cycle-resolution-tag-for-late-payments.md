## ADR-075: Persisted Cycle-Resolution Tag for Late Payments

Decision:
Add `transactions.resolved_cycle_due_date` (date, nullable). When `applyClearedPayment`
resolves a bill/debt cycle (the payment meets or exceeds the cycle target and the due
date rolls forward), it tags every cleared, linked, still-untagged transaction for that
payable with the due date that just resolved — not just the transaction that tipped it
over, but any earlier partial payments still sitting untagged from the same cycle. The
caller writing the resolving transaction itself (`useMarkCleared`'s two clear paths)
tags that row too, using the resolved due date `applyClearedPayment` now returns.
`deriveCycleInfo` (`ledger-state.ts`) excludes any transaction tagged with a
`resolved_cycle_due_date` earlier than the payable's current due date from the "current
cycle" window, regardless of its raw `transaction_date`.

Reason:
`deriveCycleInfo` infers which cycle a linked transaction belongs to purely from date
windows relative to the payable's current due date. That's ambiguous for a LATE payment
(paid after the due date it's resolving): its date falls inside the same range the
next, freshly-rolled cycle also uses, so the app misattributes it — showing the new
cycle as already "cleared" with a "Reset this cycle" action, when nothing has actually
been paid toward it, until the new due date itself passes and the stale window ages out
(surfaced 2026-08-20 on the Peacock bill). Two heuristic date-only fixes were tried and
rejected: narrowing the window breaks bills paid in full slightly early, and using the
payable's `updated_at` as a cutoff breaks ordinary partial payments, since every credit
write bumps `updated_at` past that same transaction's own `created_at`. Tagging is the
only way to record intent unambiguously without replaying full ledger history. Existing
(untagged) transactions keep today's date-window behavior unchanged — the fix is
forward-only, no backfill required.

Scope note: this only fixes the ledger-derived cycle *state badge*. It does not touch
`computeArrears`/`opening_arrears`/`arrears_as_of` (the separate, date-only "X cycles
past due" math) or the payment-allocation rules in ADR-057 — a bill/debt overdue by
multiple cycles still resolves one cycle's due-date advance per payment, with the
overflow handled entirely by the existing arrears mechanism, unchanged.

Extends: ADR-036.

Status: Decided 2026-08-20. Implemented 2026-08-20. SQL run 2026-08-21 (verified live:
`transactions.resolved_cycle_due_date` exists, nullable date).

