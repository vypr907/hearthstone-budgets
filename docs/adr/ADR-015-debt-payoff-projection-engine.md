## ADR-015: Debt payoff projection engine
Decision: Simulate payoff month-by-month in the client (src/lib/debt-payoff.ts) rather than storing projections; when a debt has known_finance_charge, use it verbatim as that debt's total interest instead of the simulated figure.
Reason: Projections change with every balance/payment edit, so caching them invites staleness. Real loan/lease paperwork is more accurate than amortization estimates for those specific debts.
Status: Decided 2026-07-30. Implemented.

