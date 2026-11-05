## ADR-072: Optional Fee Amount on Planned Bill/Debt Allocations

Decision:
pay_period_allocations gains a nullable fee_amount numeric column, used only
when bill_id or debt_id is set. The existing amount column keeps its current
meaning — the total planned outflow for that item this period (e.g. $1,111) —
unchanged, so Left-to-allocate math (ADR-071) needs no changes. fee_amount is
purely a display breakdown: the Planned row shows "$1,111 ($1,100 rent + $11
fee)" instead of just "$1,111," letting the household label what part of a
planned payment is principal vs. fee.

This does not enforce or reconcile against the real payment later — when the
actual bill/debt payment happens through pay-flow.tsx's existing fee field
(ADR-046), that's a separate, independent write. The Planned row's fee_amount
is a forecast label, not a linked source of truth; if the real payment comes
in different, the Planned figure just becomes stale like any other forecast
until edited.

Reason:
Flex-split rent payments bundle a real fee into the total each installment
(ADR-059's motivating example). Without a way to note that split, the Planned
total looks like a large, unexplained round-up over the base bill amount.
Reusing the amount-vs-fee separation already established by ADR-046, rather
than inventing new terminology, keeps the concept consistent across the app.

Schema:
```sql
alter table pay_period_allocations add column if not exists fee_amount numeric(12,2);
```

Status: Decided 2026-08-18. App side implemented 2026-08-19 (`PayPeriodAllocation.fee_amount`,
`useSetAllocation`'s `feeAmount` arg, `PlanPaymentDialog`'s optional Fee amount field, Planned
row's "$total ($base + $fee fee)" display) — pending the `alter table` + `notify pgrst,
'reload schema'` being run manually in Supabase SQL Editor.

