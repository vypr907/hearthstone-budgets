## ADR-073: Monthly Summary Card — Trailing Average vs. Budget, Combined Bills+Debts+Spending

Decision:
A new Dashboard card ("Monthly summary"), placed after "Past due" and before the net worth
trend chart. Per parent-category group (same grouping as the existing "Budget vs actual ·
this month" card), combines bills + debts + spending into one actual-so-far figure for the
current calendar month, and compares it against two expected figures shown side by side:

1. The existing manual budget target — `spending_budgets` + bills' monthly-equivalent load
   (`billsBudgetedByCategory`, unchanged) + a **new** `debtsBudgetedByCategory()`, which
   mirrors the bills version using `minimum_payment` in place of `amount`. Paycheck-deducted
   debts (`isPaycheckDeducted`, ADR-032) are excluded, matching how they're excluded from
   every other spendable-cash obligation total in the app.
2. A trailing 6-calendar-month actual average, same combined bills+debts+spending basis, over
   the 6 full calendar months immediately before the current one — the current (incomplete)
   month is never included in its own average.

Ledger-derived actuals reuse `buildActualResolver`'s pattern (category_id, falling back to
the linked bill's/debt's category) but add a `linked_debt_id` bucket alongside the existing
`linked_bill_id` one. Transactions linked to a paycheck-deducted debt are excluded entirely
(not counted as spending either), for the same reason as (1). This is a pure display
computation — never written back to `spending_budgets`, `pay_period_allocations`, or any
existing obligations/budget calculation. The existing "Budget vs actual · this month" card is
untouched.

Reason:
The household budgets per pay period (ADR-024/034/039) since bills/debts land on their own
due dates, not evenly across a calendar month — but that makes "am I spending more than usual
this month" hard to eyeball. A trailing average grounds "usual" in the household's own real
history instead of relying solely on a manually maintained target, while keeping the existing
target-based card intact. Separately, `billsBudgetedByCategory` never included debts, so a
category with only a debt minimum payment (no bill) looked emptier than its real monthly
load — extending the same monthly-equivalent pattern to debts fixes that for this card
without touching the existing card's behavior.

Schema: None — pure client-side computation over existing tables.

Status: Decided 2026-08-19. Implemented 2026-08-19.

