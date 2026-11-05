## ADR-022: account_type is always stored lowercase

Decision:
The account add/edit dialog normalizes the free-text Type field with `trim().toLowerCase()`
before writing `accounts.account_type`. Display labels are unchanged.

Reason:
The field is a free-text input, so users could save "Checking" while balance/spendable logic
(`src/lib/balances.ts`) compares against lowercase literals such as "checking" and "credit".
Normalizing at write time keeps type filters and balance rules reliable.

Status: Decided 2026-07-31. Implemented.

