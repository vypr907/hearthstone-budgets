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