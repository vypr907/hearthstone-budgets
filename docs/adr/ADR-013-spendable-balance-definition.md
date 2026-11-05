## ADR-013: Spendable balance definition
Decision: Combined spendable = accounts with is_spendable = true AND account_type in ('checking','credit'). 'savings', 'investment' and 'retirement' are excluded unconditionally. Balance per account uses the shared formula in src/lib/balances.ts.
Reason: is_spendable is a user-set flag that can be wrong on long-term accounts; the type exclusion is a hard guard.
Status: Decided 2026-08-02. Implemented.

