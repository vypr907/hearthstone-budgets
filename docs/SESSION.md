## Session Notes

- Added Paycheck Budget (/app/paycheck, linked from More): pay-date picker over ALL primary income_events (past/future, expected/received), pay-period range (this event's date → next primary event, else +14 days), bills/debts due in range with total, secondary income in range, per-category allocation sliders/inputs writing pay_period_allocations, and a large color-coded remaining figure (blue = room left, green = zero, red = over-allocated). Read-only deposit splits shown when income_source_splits rows exist. Trends tab: stacked bar chart of allocated_amount per category across pay dates, with a table alternative. Income tab: create income_sources (name, cadence, is_primary, typical_amount) and income_events (expected/actual date + amount).
- New files: src/lib/income-hooks.ts, src/lib/paycheck-budget.ts, src/routes/app.paycheck.tsx. Types added to src/lib/supabase.ts.
- Upgraded zod to v4 — the TanStack Start plugin required `.prefault()`, and the dev server refused to boot on zod 3.
- Known issues: income_source_splits editing is intentionally not built; allocation categories fall back to all categories when none have domain='spending'.
