## ADR-089: Internal transfers are not spending; budget drill-down date range
Decision:
A transfer (ADR-056) counts as spending only when it is one-sided. Two-sided
transfers — a negative and a positive row sharing the same `transfer_group_id`,
i.e. money moved between the household's own accounts — are excluded from
spending actuals and trailing averages (`internalTransferIds()` in
`src/lib/internal-transfers.ts`, applied in `combinedActualByCategory`
(`src/lib/monthly-summary.ts`) and `buildActualResolver`
(`src/lib/spending-actuals.ts`)). A leg with no counterpart row still counts as
spend, because the money left the household. Budget drill-downs set
`excludeInternalTransfers` on the `TxPreFilter` so the Transactions list matches
the figure it was opened from.

Also fixed: the Monthly Summary drill-down built its date range as
`${g.month}-01` / `${g.month}-31` while `g.month` is already a `YYYY-MM-01`
monthKey, producing the impossible range `2026-08-01-01`..`2026-08-01-31` and an
always-empty list for every category. It now uses the month key itself and a
computed real end-of-month.

Reason:
Savings showed $1,710.34 "spent" in August that was entirely two transfer legs,
and tapping the drill-down icon listed nothing at all. Neither number was real:
one came from counting internal money movement as spend, the other from a
malformed date filter.

Status: Decided 2026-08-31. Implemented.

