# Mobile polish pass — 8 items

No new ADRs. Existing decisions referenced: ADR-023, 029, 032, 034, 039, 049, 053/063, 056, 059, 060.

## 1. Bottom clearance + font size
- `src/routes/app.tsx`: layout `pb-20` → `pb-[calc(6rem+env(safe-area-inset-bottom))]`.
- `src/components/AddTransactionFab.tsx`: FAB `bottom-24` → `bottom-[calc(6rem+env(safe-area-inset-bottom))]`.
- `src/routes/app.index.tsx` lines 767–768 (BudgetTile over/left span): `text-[10px]` → `text-xs`, nothing else.

## 2. `BudgetSplitLines` component
New `src/components/BudgetSplitLines.tsx` with props `{ spendingBudgeted, billsBudgeted, spendingSpent, billsSpent, extra? }`. Two rows (🛒 Spending, 🧾 Bills): a `text-[10px] tabular-nums text-muted-foreground` line with label left and `spent / budgeted` right (bold + destructive when over, else bold + foreground), each followed by an `ItemBar` using the existing clamped pct formula. Optional `extra` renders one more small line.
Used in the expanded block of `BudgetTile` (app.index.tsx ~777) and `SpendRow` (app.spending.tsx ~774, with `extra={{ label: "3-mo avg", value: r.avg3 }}`). Collapsed states untouched.

## 3. Floating "left to allocate" (Paycheck Budget)
In `PeriodBudget` (app.paycheck.tsx), add a `fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom))] left-0 right-0 z-30 mx-auto max-w-lg px-4` pill rendering the existing `left` value with the existing Over-allocated / Fully allocated / Left-to-allocate label+color logic. No new state; the existing summary Card stays.

## 4. Transactions search + amount range
`src/routes/app.transactions.tsx`: icon-prefixed search Input under `AppHeader` above the Sort/Group grid, bound to `searchQuery`, matching `description` or resolved place name (case-insensitive). Inside the collapsible filter panel, a `grid grid-cols-2 gap-2` row with "Amount from"/"Amount to" number inputs (`amountMin`/`amountMax`) filtering on `Math.abs(Number(t.amount))`. All three added to the rows `useMemo` deps, `activeFilterCount`, and `clearFilters()`.

## 5. HelpButton pass
New `src/components/HelpButton.tsx`: ghost icon button with `HelpCircle` (h-3.5 w-3.5) in a Popover, content `side="top" className="max-w-64"`, children as `text-sm`. Placed inline (`inline-flex items-center gap-1`) next to: Dashboard hero set-aside figure, "Available credit" row, "Past due" header, and the Paycheck "Projected" badge — with the copy given.

## 6. Dashboard reorg
- Move the Payoff progress block to directly after the "Still owed this {period}" card and make it collapsible, default closed, using the chevron-toggle idiom from the Transactions filter panel.
- Split the Past due list into two sub-lists under the same header: "Paycheck / HSA deduction" group first (ids whose debt has `is_paycheck_deduction === true`, matched after stripping the `debt-`/`bill-` prefix), then the rest. `overdueTotal` stays combined. No HSA-specific field or logic added.

## 7. Transfer helper text
In the Transfer block of `AddTransactionFab.tsx`, after Amount and before Category, add the static muted helper line explaining transfers move money between the household's own accounts, so no place is needed.

## 8. Clickable Accounts recent activity
Export `TransactionDetail` from `app.transactions.tsx` (no internal changes). In `app.accounts.tsx`, add `detail` state, mount `<TransactionDetail>` alongside the other dialogs, thread an `onSelect` prop through `RecentActivity`, and make each row clickable with `cursor-pointer`. Split rows keep current behavior.

## Docs
Update `docs/SESSION.md` (per-item bullets) and `docs/TODO.md` if items are opened/closed. No schema change, so `SCHEMA.md`/`DECISIONS.md` untouched.
