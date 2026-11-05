## ADR-034: Budget Totals Include Linked Bill Amounts, Shown as Two Parts

Decision:
For a spending category, "Budgeted" displayed on Dashboard/Spending =
spending_budgets.budgeted_amount + sum of monthly-equivalent amounts of bills linked
to that category_id (via ADR-033's monthly-equivalent, see below). The two parts are
always shown separately (e.g. "$20 spending + $12.65 bills = $32.65"), never merged
into one opaque number. Same split applies to "Spent": manual/ledger spending vs.
bill payments already made this cycle.

The Dashboard hero card is rebuilt around Spendable balance as the primary number
(not obligations), absorbing the existing lower "monthly obligations" breakdown card
into itself rather than showing both. A new card is added: bills/debts amount still
owed this pay period/month, grouped by category. Net Worth Trend moves to the bottom
of the Dashboard.

Reason:
Rocket Money/Mint-style "$40 left" hides that $30 of it is already spoken for by an
upcoming bill. Splitting spendable-vs-committed makes the number trustworthy at a
glance instead of requiring mental math against the Bills screen.

Status: Decided 2026-08-04. Dashboard portion implemented 2026-08-06 (hero rebuilt around
combined spendable with per-period bill/debt set-aside totals, "still owed this period"
card grouped by category, Net Worth Trend moved to the bottom, overdue amounts and payoff
progress corrected). Budget/actual spending-vs-bills split implemented 2026-08-06 on the
Spending screen and the Dashboard budget-vs-actual card.

**2026-08-18 addendum — what the hero "set aside this pay period" figure means:**
`periodTotals.total` (`src/routes/app.index.tsx`) = sum, over
`obligationsInRange(bills, debts, period.start, period.end)`
(`src/lib/paycheck-budget.ts`), of each bill's `cycle_amount_due ?? amount` plus each
debt's `minimum_payment`, for bills/debts due inside the current period — excluding
debts flagged `is_paycheck_deduction` and any already `date_paid_off`. `period` runs
from the primary income source's most recent past-or-today paycheck date up to its
next scheduled one (or 14 days out with none scheduled), falling back to the
calendar month when there's no primary income source. This is a forward-looking
target — bills + minimum debt payments due before the next paycheck — not money
already moved into savings, despite the "set aside" wording. Documented here for
tooltip copy; no behavior change.


