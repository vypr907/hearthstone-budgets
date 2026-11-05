## ADR-032: Paycheck-Deduction Debts Excluded from Cash Obligations

Decision:
Add `debts.is_paycheck_deduction boolean not null default false`. When true, the debt
is excluded from Paycheck Budget's obligations-in-range total and Dashboard's monthly
obligations total (it never touches a spendable account), but still appears in Debts,
Everything, and the payoff-strategy calculator unchanged.

Reason:
TSP Loan and similar debts are serviced via payroll/HSA deduction before the paycheck
ever hits a tracked account. Counting them as "due this period" double-subtracts money
that was never actually available to spend.

Status: Decided 2026-08-04. Implemented 2026-08-04 — `is_paycheck_deduction` toggle on
the debt form, badge on Debts list/detail, excluded from `obligationsInRange()` and shown
via `deductedObligationsInRange()` on Paycheck Budget. Dashboard exclusion pending.

