## ADR-071: Manually Planned Bill/Debt Rows Excluded From Obligations Total (Amends ADR-059)

Decision:
When a bill/debt has one or more pay_period_allocations rows (bill_id/debt_id set)
for a given pay period, its auto-matched due-date amount is excluded from that
period's obligations total feeding Left-to-allocate math — the Planned row(s)
already represent the real expected payment for this item this period, so
counting both double-subtracts the same obligation.

The "Due this period" section still displays the item (ADR-059's visual
separation is unchanged) — a household member can still see "this is
technically due by the calendar," it just no longer contributes twice to the
bottom-line math. Only the totals calculation changes.

Applies per-item, not per-bill-globally: if a bill has no planned row for a
given period, it's counted from Due as today. If it has one, only the
Planned figure counts.

Reason:
ADR-059 intentionally didn't deduplicate the two sections since "due" and
"planned" answer different questions — but that reasoning covered the
*display*, not the *totals math*. Left-to-allocate double-subtracting the
same rent payment through both the auto-match and the manual plan is a
straightforward math bug the visual-separation reasoning never addressed.

Status: Decided 2026-08-18. Implemented 2026-08-19 — new
`obligationsTotalExcludingPlanned()` (`src/lib/paycheck-budget.ts`), wired
into `PeriodBudget`'s `obligationsTotal` (`src/routes/app.paycheck.tsx`) via
a `plannedKeys` set built from this period's `pay_period_allocations` rows.
`obligations` (the "Due this period" list) and `planned`/`plannedTotal` are
untouched — only the aggregate total feeding Left-to-allocate and the
"Obligations total" footer changed.


