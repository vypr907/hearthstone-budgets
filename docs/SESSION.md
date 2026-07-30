## 2026-07-30 – Phase 4 Spending Import

- Diagnosed empty `spending_budgets`/`spending_actuals`: Phase 4 Lovable prompt never built an "add budget item" flow, and no rows were seeded per category (unlike Phase 1's category seed)
- Seeded one `spending_budgets` row per existing spending category (budgeted_amount = 0) as a stopgap
- Mapped Spending sheet CSV → schema: Item → categories.name (join key), Category → parent_category (display only, not a join key), Amount → spending_budgets.budgeted_amount, JUL/JUN/MAY → spending_actuals.actual_amount (one row per month), 3 Month Average → dropped (computed live), Notes → dropped (no column exists, flagged for future decision)
- Created `spending_import` staging table; imported cleaned CSV
- Pre-insert validation caught two mismatches between sheet and seeded categories:
  - "Gifts/Holidays" vs "Gifts & Holidays" — cosmetic naming drift, resolved by normalizing `categories.parent_category` to "Gifts & Holidays"
  - "Business" item missing entirely — turned out to be a Phase 1 rename (sheet's "Business" → app's "Side Gig", same parent_category "Business"); fixed via `update spending_import set item = 'Side Gig' where item = 'Business'`
- Ran `spending_budgets` insert + 3 separate `spending_actuals` inserts (one per month; noted `union all` + `on conflict` doesn't upsert per-branch in Postgres, must be separate statements) — all use `on conflict do update`, safe to re-run without creating duplicates
- Outstanding: decide whether to add a `notes` column to spending tables; still no in-app "add budget item" UI (SQL-only for now)

- Spending screen: group headers now use categories.parent_category text directly (fixes "Other" labels); added "New budget item" flow (pick or create a category, initial budgeted amount, optional description); items with a spending_budgets.description show a (?) icon with a popover.
## 2026-08-02 – Phase 5: Quick add transaction, account statements, dashboard spendable

- Added a global floating "Add transaction" button (src/components/AddTransactionFab.tsx) rendered in the /app layout, so it's one tap from every screen. Asks only for account, amount, optional category, and description; date defaults to today and status to 'cleared'. Positive amounts are stored as money out (negative); enter a negative amount for money in.
- Saving invalidates transactions, latest_balances and spending_actuals, so balances update everywhere immediately.
- Extracted the shared balance formula into src/lib/balances.ts (anchor = latest snapshot else starting_balance; current = + cleared; spendable = + cleared and pending) and reused it on Accounts and Dashboard.
- Accounts screen: each account card now shows a bank-statement style "Recent activity" list (5 rows, expandable to 25) with date, description, pending marker and signed amount.
- Spending screen: current-month actual now comes from categorised ledger transactions when any exist for that category/month; the manual monthly total remains the fallback when there are none (ledger-sourced cells are read-only). Same rule applies to the 3-month average.
- Dashboard: added a spendable balance card (only is_spendable checking/credit accounts; savings, investment and retirement always excluded) with a breakdown of checking total, available credit (credit_limit − owed), and savings labelled as not included. Added a current-month budgeted-vs-actual progress chart grouped by parent_category.
- Types: Account now includes is_spendable and credit_limit.
- Known issues: credit "available credit" assumes balances are stored signed either way and uses the absolute owed amount; the combined spendable total sums raw balances for credit accounts rather than available credit, per spec.

- Added Debt Strategy screen (More menu): avalanche/snowball/custom payoff simulation with side-by-side comparison of months to debt-free, total interest, and savings vs minimums-only; active strategy + extra monthly payment persist to debt_strategy_settings; per-debt payoff order shows cleared ledger payments (linked_debt_id) as payment history; known_finance_charge overrides projected interest for those debts. Known issue: projection assumes fixed rates and no new borrowing.
