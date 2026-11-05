## ADR-086: Monthly cycles are the calendar month
Decision: In `deriveCycleInfo` (ADR-036), a monthly bill/debt's cycle is the
calendar month containing today — every linked transaction dated in that month
counts toward that cycle, early or late, and the cycle resets on the 1st. The
ADR-075 `resolved_cycle_due_date` tag is compared by month for monthly items
(only a tag from a *previous* month excludes a transaction). Non-monthly cycles
(biweekly / weekly / custom interval / one-time) keep the existing
`next_due_date`-anchored rolling window unchanged. `CycleInfo.resolved` is still
set for a cleared monthly cycle whose `next_due_date` has already rolled past
the month end, so the stranded-payment repair and reversal paths behave as
before. Debt detail's "Cycle window" now shows this counted range directly (e.g.
Aug 1 – Aug 31); non-monthly items additionally show their billing period.
Reason: The window hung off `next_due_date` drifts with the stored row. A drift
check across 42 debts found 4 rows whose `next_due_date` day no longer matches
`due_day` (Aarons - Dresser 21→Aug 18, Alpine Medical - Stephanie 18→Jul 29, and
two biweekly rows), producing nonsense windows like "Aug 18 – Aug 26" and a
cleared on-time payment reading as unpaid. Anchoring by `due_day` was rejected
because `bills` has no `due_day` column at all — the calendar month is the one
rule both tables can express, and it matches how the household actually thinks
about a monthly bill.
Status: Decided 2026-08-26. Implemented.

**2026-10-17 addendum — monthly/one-time debts' `next_due_date` now rolls
forward too (parity with bills).** Found while investigating why "Aarons -
Dresser"'s due date stayed stuck at 2026-09-21 after a cycle correctly
cleared: three debt-side RPCs (`apply_cleared_debt_payment`,
`apply_debt_cycle_reset`, `apply_debt_mark_unpaid` — all written together in
the ADR-101 atomic-RPC pass, 2026-09-24, a month *after* this ADR) each
explicitly excluded `billing_cycle = 'monthly'` (and, for the cleared-payment
RPC, `'one_time'`) from ever advancing/reverting `next_due_date`. Their bill
equivalents (`apply_cleared_bill_payment`, `apply_bill_cycle_reset`,
`apply_bill_mark_unpaid`) have **never** had this exclusion — bills have
always rolled `next_due_date` forward monthly via `shift_billing_date`
(which already no-ops for `'onetime'` internally and correctly clamps to the
target month's last day, so it's safe for every cycle kind) — this ADR's own
`deriveCycleInfo` monthly-by-calendar-month logic was already written to
tolerate a monthly `next_due_date` that keeps advancing ("a payment tagged
with this month's due date still belongs to this month even after clearing
rolled `next_due_date` into the next one," `src/lib/ledger-state.ts`), so the
exclusion was never load-bearing — just unexercised for debts. Removed the
`'monthly'`/`'one_time'` exclusion from all three functions' `next_due_date`
logic (and from `apply_cleared_debt_payment`'s `resolved_due_date` RETURNING
expression, which `rollback_cleared_debt_payment` already unconditionally
expects — matching how `rollback_cleared_bill_payment` has always worked),
bringing all three to byte-for-byte structural parity with their already-
correct, already-in-production bill counterparts. No application code
change: the JS wrappers (`applyClearedPayment`, `useMarkUnpaid`,
`useResetCycle` in `src/lib/payments.ts`) already pass `resolved_due_date`
through generically for both bills and debts — purely a database function
fix, in `scripts/migrations/2026-10-17-monthly-debt-next-due-date-
rollforward.sql`.

Status: addendum decided 2026-10-17. Function-fix migration run by the user
and confirmed live via the read-only MCP. No application code changes
required.

**Data cleanup, same addendum.** The function fix only prevents *future*
staleness — it doesn't repair rows the bug already froze. An audit of "Our
Household" (`scripts/migrations/2026-10-17-stale-monthly-debt-due-dates-
cleanup.sql`) found 12 monthly debts stuck 9–89 days stale, all already
fully resolved (`payment_status = 'cleared'`, `cycle_paid_to_date = 0`,
nothing owed): Car, Alpine Medical - Stephanie, North Star Radiology, Mom,
Providence Alaska, OPA/OrthoAlaska, Yukon Eye, Ticket 1, Ticket 2,
Aarons - Dresser, Mission Lane, Milestone. Zero bills were stale (confirmed
via the same query shape — consistent with bills never having had this
bug). Each is set to the next upcoming occurrence of its own `due_day` from
today, not a reconstruction of exact missed cycles — a historical
reconstruction (shift forward by one cycle from each debt's last matching
cleared payment) was tried first but proved unreliable for at least two
rows ("Ticket 1"'s last matching cleared payment is from April, long before
its stale August due date; "Mom" has no matching cleared-payment row at
all, likely paycheck-deduction-funded, ADR-032) — since every row is
already fully paid with nothing owed, "what should show as next due right
now" is the safe question these numbers actually need to answer.

Status: cleanup migration run by the user 2026-10-17, confirmed live via the
read-only MCP — all 12 rows match exactly, `payment_status`/
`cycle_paid_to_date` untouched on every one. A household-wide re-audit after
the cleanup (same stale-cleared-monthly-debt query) found zero remaining.

