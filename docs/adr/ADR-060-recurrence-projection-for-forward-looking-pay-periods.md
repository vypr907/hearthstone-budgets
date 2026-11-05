## ADR-060: Recurrence Projection for Forward-Looking Pay Periods

Decision:
Add a purely computed (no new schema, no new rows) recurrence-projection
function that extends `obligationsInRange()`'s reach beyond a bill/debt's
single stored `next_due_date`/`due_day`. For any pay period that is beyond
the item's current unpaid occurrence, the function walks forward by the
item's `billing_cycle` interval — reusing whatever existing cycle-advance
logic already computes the *next* due date when a cycle is cleared (find
and reuse that function; do not write a second date-math implementation) —
generating however many projected occurrences are needed to reach the last
period the household has an entered pay date for. Nothing is written to the
database; a projection exists only for the duration of rendering the
Paycheck Budget screen and is recalculated every time.

Projected occurrences appear in the same "Due this period" card as real
due items, but visually and textually distinguished — e.g. a "Projected"
badge or muted styling — so a household member can tell at a glance which
figures are confirmed-due versus estimated-from-recurrence. Projected
amounts DO count toward the period's total/left-to-allocate math (ADR-039),
since the entire point is to let the household plan against them; they are
simply labeled differently, not excluded from totals.

Projection horizon: exactly as far as the household's own entered future
pay dates reach — no fixed window, no projecting past the last pay date
currently in the system. Adding one more future pay date automatically
extends how far projections run; removing one contracts it. No
configuration needed.

Reason:
`obligationsInRange()` only ever knows a bill/debt's single next unpaid
occurrence — correct for arrears/current-cycle tracking (ADR-024/049), but
structurally blind to anything beyond it, confirmed by direct diagnosis:
the period 8/27→9/10 populates correctly, while 9/10→9/24 shows nothing
despite dozens of monthly-recurring bills that obviously recur into it.
This isn't a bug in the existing range comparison — it's a missing
capability (the app has no concept of a bill's *future* occurrences, only
its current one). Reusing the household's own entered pay dates as the
projection horizon (rather than a fixed lookahead window) means projections
never outrun what's actually plannable — there's no pay period to plan
against beyond the last entered pay date anyway.

This is intentionally separate from and complementary to ADR-059 (manual
per-period planning for cases like Flex/rent where the split truly isn't
determined by any due date at all). ADR-060 handles the ordinary case —
every recurring bill/debt's due date, projected forward. ADR-059 handles
the exceptional case — an amount that can't be derived from a due date no
matter how far you project it.

Non-goals:
- Does not change `next_due_date`/`due_day` or any stored data — purely a
  display-layer projection.
- Does not attempt to predict *variable*-amount bills' future amounts
  beyond repeating their current `amount`/default — no forecasting of
  amount drift, only date/recurrence.
- Does not affect arrears/`computeArrears` (ADR-049) — that logic is
  unchanged; this only extends how far into the future the *upcoming*
  side of the Paycheck Budget screen can see.

Implementation notes:
1. Find the existing function that advances a bill/debt's due date forward
   by one cycle (used when a payment clears a cycle) — reuse its interval
   math (monthly/biweekly/quarterly/bimonthly/annually/custom) rather than
   reimplementing billing_cycle logic a second time.
2. New function, e.g. `projectOccurrences(item, throughDate)`: starting
   from the item's current `next_due_date`/computed due date, repeatedly
   advance by one cycle, collecting each resulting date, until the date
   exceeds `throughDate` (the end of the last period with an entered pay
   date).
3. `obligationsInRange()` (or the Paycheck Budget screen's data assembly)
   calls this per bill/debt once, then buckets each real+projected
   occurrence into whichever period's range it falls in, same half-open
   `start <= d < end` comparison already in use.
4. UI: projected line items get a visual marker distinguishing them from
   real due items; total/left-to-allocate math includes both.

Status: Decided 2026-08-12. Implemented 2026-08-13 (`projectOccurrences()` + `obligationsInRange(..., projectThrough)` in `src/lib/paycheck-budget.ts`; "Projected" badge on the Paycheck Budget screen).

---

