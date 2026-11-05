## ADR-049: Arrears — track how much is past due, not just that something is
Decision:
Overdue becomes a money figure. `src/lib/arrears.ts` exports `computeArrears`,
a pure function over a payable:
1. Walk forward from the item's current due date in billing-cycle steps until
   today. Every due date already passed is a missed cycle. The first (current)
   cycle counts only what is still owed on it (`cycle_paid_to_date` netted off);
   every later passed date counts the full cycle amount.
2. Add `opening_arrears` — a manual figure for money already past due before
   Hearthstone tracked the item. Cycles on or before `arrears_as_of` are skipped
   so the manual figure and the walk cannot double count.
3. One-time charges (ADR-048) stop after their single due date. Debts with a
   zero remaining balance report only their carry-in.
Bills and Debts both gain `opening_arrears` and `arrears_as_of` columns and a
"Past due carried in" block in their forms. `PastDueBadge` renders
"N cycles · $X past due" on Bills and Debts rows, and the Dashboard "Overdue"
section becomes "Past due", showing the arrears total and how many cycles behind
each item is.

Reason:
The previous signal was boolean (`isDateOverdue`) and only ever surfaced one
cycle's remaining amount, so a bill three months behind looked the same as one
a day late. Deriving missed cycles from the due date needs no new ledger rows,
and the manual carry-in covers items that were already behind on day one.

Status: Decided 2026-08-11. Implemented.

### ADR-049 addendum (2026-08-27): "past due" display is prior-months-only; monthly-debt one-month lookback

Two problems surfaced when the calendar rolls into a new month:

1. **Double-count on the Dashboard.** `computeArrears().amountOverdue` folds the
   current cycle's own remainder into the total once its due date has passed —
   correct as a "total to get fully current" / payoff figure, but the current
   cycle *also* shows under "Still owed this period" (ADR-080), so the Dashboard
   was adding the same cycle twice (up to ~$2–3× the real figure for an item a
   month or more behind). New `priorArrearsSummary(p)` runs the same walk with
   its reference date clamped to the **first of the current calendar month**, so
   it returns arrears from cycles that belong to a *prior* month only. The
   Dashboard "Past due" card and `PastDueBadge` now use it; `computeArrears`
   itself is unchanged and stays the payoff/repair figure used on the detail
   panel and by all payment math. An item still appears in both "Past due" and
   "Still owed this period" — the two are meant to be additive (a missed August
   cycle + a live September cycle = two months genuinely owed). Residual edge:
   for a mid-month due date viewed early in the following month, before that
   month's due date and outside the current pay period, the prior cycle can
   still show in both lists briefly; it self-corrects once the due date passes,
   and the over-count is far smaller than before.

2. **Monthly-debt arrears vanished.** `debtDueDate()` recomputes `due_day` inside
   the current calendar month and never looks back, so a monthly debt's missed
   prior-month cycle left no due-date signal and the walk never counted it.
   `arrearsWalkStart()` (internal to `arrears.ts`) now steps a monthly debt's
   walk start back one month when this month's due day is still ahead and the
   current cycle isn't settled (`payment_status='cleared'` or
   `cycle_paid_to_date >= minimum_payment`). Bills and non-monthly debts are
   untouched — their `next_due_date` is a real stored pointer.
   **Known limit:** recovers at most ONE missed prior month (the debt row has no
   per-cycle history). A deeper miss needs `computeArrears` to read the linked
   ledger — tracked in `docs/TODO.md`.

No schema change. Cross-referenced from ADR-080.

