## ADR-054: Income sources are cards with their own detail route
Decision: Each income source on the Paycheck Budget screen is a card linking to
`/app/income-source/$id`. The detail view shows this-year, all-time, and monthly
average income, the full pay-date history, an Edit form, and a full editor for
the ADR-047 deposit splits (fixed or remainder, per account, optional day
offset).

Reason: A paycheck that lands across checking, savings, HSA, and retirement
needs its splits described somewhere; the old read-only list gave no place to do
it and no view of what a source has actually paid.

Status: Decided 2026-08-11. Implemented.

