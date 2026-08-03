## Session Notes

- Added Paycheck Budget (/app/paycheck, linked from More): pay-date picker over ALL primary income_events (past/future, expected/received), pay-period range (this event's date → next primary event, else +14 days), bills/debts due in range with total, secondary income in range, per-category allocation sliders/inputs writing pay_period_allocations, and a large color-coded remaining figure (blue = room left, green = zero, red = over-allocated). Read-only deposit splits shown when income_source_splits rows exist. Trends tab: stacked bar chart of allocated_amount per category across pay dates, with a table alternative. Income tab: create income_sources (name, cadence, is_primary, typical_amount) and income_events (expected/actual date + amount).
- New files: src/lib/income-hooks.ts, src/lib/paycheck-budget.ts, src/routes/app.paycheck.tsx. Types added to src/lib/supabase.ts.
- Upgraded zod to v4 — the TanStack Start plugin required `.prefault()`, and the dev server refused to boot on zod 3.
- Known issues: income_source_splits editing is intentionally not built; allocation categories fall back to all categories when none have domain='spending'.
- Visual restyle pass (presentation only, no query/schema/logic changes): new design tokens in src/styles.css (--brand, --gradient-brand, --shadow-card, --item-1..6, soft neutral --background); cards are 16px radius, borderless with a soft shadow; bottom nav is icon-only with a filled rounded chip behind the active icon.
- New src/components/viz.tsx: ProgressRing (48px), ItemBar (per-item rotating colors), EmojiIcon + emojiFor, itemColor palette.
- Dashboard: single gradient hero card ("$X to go · Y% paid off" + spendable/obligations tiles + slim progress bar baked into the bottom); spendable breakdown, budget-vs-actual rings, spending bars, payoff bars and overdue rows restyled with bold amounts and small uppercase labels.
- Bills, Debts, Accounts, Spending: emoji icons, bold/large dollar amounts, small gray uppercase labels, per-item recolored progress bars (Bills partial-payment, Debts payoff) and progress rings on Spending rows.
- Known issue: no donut chart exists yet, so the "total centered in the donut hole" rule has nothing to apply to.

- ADR-027 Savings Goals: new /app/goals screen (linked from More) listing sinking-fund cards with EmojiIcon, ProgressRing/ItemBar, days-left and "save $X/month" math, + New Goal / Edit / Delete, and +Add / −Withdraw quick entries that write a cleared transaction with linked_goal_id.
- current_amount is derived, never stored: computeGoalBalances() in src/lib/balances.ts sums cleared transactions per goal (plus monthsRemaining/daysRemaining helpers). New hooks useSavingsGoals/useUpsertSavingsGoal/useDeleteSavingsGoal; SavingsGoal type and Transaction.linked_goal_id added.
- Known issue: the savings_goals table + transactions.linked_goal_id column must be created manually in Supabase (see ADR-027 SQL) — until then the screen shows an empty list / query error.

- ADR-028 Status Snapshot: new /app/snapshot (linked from More) rendering a one-page snapshot — header (household name + now), red-accented Overdue section with per-item days overdue and a total, Next-14-days section sorted soonest first, and next primary paycheck (date + expected amount). Uses EmojiIcon/ItemBar from viz.tsx.
- Export: one html2canvas render, two encodings — PNG by default, single-page jsPDF when households.export_format = 'pdf'. New /app/settings screen toggles that column.
- New files: src/lib/snapshot.ts (buildSnapshot/exportSnapshot), src/routes/app.snapshot.tsx, src/routes/app.settings.tsx. New hooks useHousehold/useSetExportFormat; Household.export_format + ExportFormat types.
- Used html2canvas-pro instead of html2canvas 1.4.1: the original throws on the app's oklch color tokens.
- Known issue: the `alter table households add column export_format ...` migration must be run manually in Supabase (own project, no agent DB access) — until then Settings saves will error and exports fall back to PNG.

- Snapshot styling pass (presentation only, ADR-028 data logic untouched): /app/snapshot now uses the Dashboard's visual language — gradient brand hero card (household name, timestamp, combined due-now + 14-day total, ProgressRing showing what share of that is overdue), shadowed 16px cards, bold tabular amounts with small uppercase gray labels, EmojiIcon + per-item ItemBar rows.
- One-page cap enforced: Overdue shows the bold "$X overdue across N items" total plus only the top 5 by dollar amount, then "+N more overdue — see full list in app."; Upcoming shows total + top 5 by due date with the same "+N more" note. Next paycheck stays a single line. Helpers SNAPSHOT_MAX_ROWS/topByAmount live in src/lib/snapshot.ts.
- Overdue section carries a destructive border/tint accent matching the Bills status badges; upcoming stays neutral.
- exportSnapshot now measures the capture node (width/windowWidth/its own background) instead of the body, so html2canvas reproduces the styled card layout rather than reflowing it.

- Export capture library verified/cleaned: exportSnapshot uses html2canvas-pro exclusively; the unused html2canvas 1.4.1 dependency was removed from package.json (it cannot parse the app's oklch/lab theme tokens and stripped all styling from the PNG). Verified with a throwaway route + headless capture: exported PNG keeps card backgrounds/shadows, the app sans-serif font, and a filled colored ProgressRing arc at the correct percentage. src/routes/app.snapshot.tsx unchanged.
