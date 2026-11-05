## ADR-080: Overdue Bills/Debts Stay in "Due This Period" Until Paid

Decision:
`obligationsInRange()` and `deductedObligationsInRange()` (`src/lib/paycheck-budget.ts`)
now include a bill/debt when its due date falls before the period's `start` too, as long
as the period hasn't fully elapsed (`end > today`) — not just when the due date falls
strictly inside `[start, end)`. An overdue item keeps showing at its normal per-cycle
amount in the current period and every future period's "due this period" list until it's
actually paid (the only thing that advances `next_due_date`/`debtDueDate` past `start`).
Already-elapsed past periods are left alone — this isn't retroactive, and doesn't affect
what a historical period showed at the time.

Reason:
Found 2026-08-22: Dashboard's "Still owed this period" (`app.index.tsx`'s
`periodObligations`/`owedByCategory`) and Paycheck Budget's "Due this period" both drove
off `obligationsInRange()`, which only matched `inRange(due, start, end)` — an overdue
bill/debt whose due date had slipped before the period start simply vanished from the
normal list, even though it was still unpaid and still owed. It only appeared in the
separate "Past due"/"Overdue" section (Dashboard's `computeArrears()`-based `overdue`
list), which is driven by different logic and doesn't feed Paycheck Budget at all. User
confirmed (2026-08-22) this should fix at the shared `obligationsInRange()` level so both
screens pick it up, and that overdue items should keep appearing "every period until
it's actually paid" rather than being special-cased to only the current period.

Status: Decided 2026-08-22. Implemented 2026-08-22.

### ADR-080 note (2026-08-27, see ADR-049 addendum): interaction with "Past due"

Keeping an overdue item in "due this period" overlapped with the Dashboard's
"Past due" card, which counted the *same* cycle again via
`computeArrears().amountOverdue` (it folds the current cycle in). The Dashboard
"Past due" total now uses `priorArrearsSummary()` — prior calendar months only —
so an overdue item shows in both "Still owed this period" (its current cycle) and
"Past due" (its earlier missed cycles) without the shared cycle being counted
twice. ADR-080's list-membership rule here is unchanged.

