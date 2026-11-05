## ADR-012: Ledger-derived spending actuals with manual fallback
Decision: A category's actual for a month is the sum of its negative transactions that month when any exist; otherwise the manually entered spending_actuals row is used. Ledger-derived cells are not editable inline.
Reason: Avoids double-counting and avoids retyping monthly totals for categories already tracked as transactions, while keeping manual entry for categories that are never itemised.
Status: Decided 2026-08-02. Implemented.

