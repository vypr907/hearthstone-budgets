# Everything page: filters, groupings, and row detail

Rework `/app/everything` into a fully filterable, groupable list where a row tap opens the same detail window used on the Bills and Debts screens.

## Filters (stacked, all combinable)

- Search (unchanged)
- Type: All / Bills only / Debts only
- Paid status: All / Unpaid / Pending / Partial / Cleared (from the ADR-036 ledger state, not the stored column)
- Due window: Any / Due this pay period / Due this month
- Category: multi-select (reuse the existing category filter popover pattern from `ListControls`)

"Due this pay period" uses the primary income source's current pay period (same `periodRange` logic the Debt detail already uses for its "Pay period" line), and keeps items that are overdue but not yet cleared, consistent with `isDueOrOverdueInPeriod`. "Due this month" is the current calendar month, matching the ADR-086 monthly cycle window.

## Grouping

Group by: None / Category / Bill vs Debt / Paid status / Due this pay period / Due this month. The last two render two groups (in-window vs not). Each group gets a header with the group name, item count, and summed amount.

## Sorting

Due date, Amount, Alphabetical (A–Z by name).

## Row layout

```text
[state icon]  due 9/21 · Aarons — Dresser        [Cleared]   $97.10
              [monthly]  [Household]
```

- The Bill/Debt word becomes an emoji marker instead of a text label.
- Due date moves to the front of the secondary line.
- Cycle and category become aligned chips on their own line, so they line up down the list instead of running together in one comma string.
- Tapping the round state icon still advances the pay state (unchanged behavior).
- Tapping anywhere else on the row opens the detail dialog.

## Detail on tap

The Bills and Debts screens already have full detail dialogs (`BillDetailDialog`, `DebtDetailDialog`) plus their edit dialogs. These will be exported from their route modules and reused on Everything, so Everything gets identical detail + Edit behavior with no duplicated UI.

## Technical notes

- Files: `src/routes/app.everything.tsx` (main rework), plus `export` added to `BillDetailDialog`/`BillDialog` in `src/routes/app.bills.tsx` and `DebtDetailDialog`/`DebtDialog` in `src/routes/app.debts.tsx`. No behavior change on those screens.
- Pay-period helper (`payPeriodFor`) currently lives inside `app.debts.tsx`; it moves to `src/lib/payment-schedule.ts` (or a small shared helper) so both screens use one implementation.
- Filtering/grouping is derived in a single `useMemo` over the existing `useBills`/`useDebts`/`useCategories` hooks — no schema change, no new queries, no ADR required beyond a documentation note.
- Docs: append a SESSION.md entry; add a short ADR only if you want the Everything filter/group model recorded as a decision (say the word and I'll number it next in sequence).
