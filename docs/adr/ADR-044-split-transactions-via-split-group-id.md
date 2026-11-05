## ADR-044: Split Transactions via split_group_id

Decision:
Add `transactions.split_group_id uuid` (nullable, no FK — self-referencing group tag,
not a parent row). Splitting a purchase writes N transaction rows sharing the same
split_group_id, account_id, transaction_date, and status, each with its own
category_id and amount, summing to the entered total. Editing a split re-deletes and
re-inserts all rows in the group rather than patching individual lines, avoiding
partial-state bugs.

Split transactions are manual entries only (no linked_bill_id/linked_debt_id) — bill/
debt payments stay single-row, since they're tied to one payable and one cycle.

Reason:
balances.ts, spending-actuals.ts, and every other consumer already aggregate
transactions by summing amounts per account/category/month (ADR-012, ADR-013) — they
need zero changes to handle more rows. A parent/child line-item table would require
every consumer to special-case aggregation for no benefit, violating "reuse before
create."

Schema change:
```sql
alter table transactions add column split_group_id uuid;
```

Status: Decided 2026-08-10. Not yet implemented.


