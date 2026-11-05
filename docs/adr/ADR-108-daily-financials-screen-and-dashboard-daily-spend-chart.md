## ADR-108: Daily Financials Screen and Dashboard Daily-Spend Chart

Decision:
A new `/app/daily-financials` screen and a new Dashboard chart, both purely
client-side aggregation over existing columns — no schema change.

1. **Daily Financials screen** (`src/routes/app.daily-financials.tsx`,
   `src/lib/daily-financials.ts`): pick a day (Popover + the existing
   shadcn `Calendar` component — first real use of it in this app; every
   other date field elsewhere is a plain `<input type="date">`, but the
   user specifically asked for a calendar picker here) and see:
   - Money in / money out / net for that day — whole-ledger cash movement,
     every transaction dated that day, transfer-internal legs excluded via
     the existing `internalTransferIds`/`opaqueTransferAccountIds`
     (ADR-089/107), no category or bill/debt filtering.
   - Spending by category, categories with zero spend that day omitted,
     each expandable (via the existing-but-previously-unused shadcn
     `Collapsible`) to a per-institution breakdown read directly off
     `transactions.institution_id` (ADR-053). **Deliberately spending-only**
     — a transaction carrying `linked_bill_id`/`linked_debt_id` is excluded
     here, shown only in the list below instead — chosen over folding
     bills/debts into category totals (the convention `combinedActualByCategory`/
     `actualByCategoryInRange` use everywhere else) specifically so the same
     dollar doesn't visibly double-count between the two sections on one
     screen.
   - Bills/debts paid that day, grouped by linked bill/debt id.
   - Every section keys off `transaction_date`, never `cleared_date`
     (ADR-100) — the user's own instruction — and includes pending +
     cleared transactions alike, matching how every other spend-total
     function in this codebase already works (none of them gate on
     `status`).
2. **Dashboard daily-spend chart** (`src/routes/app.index.tsx`, bottom of
   the "More Info" / full-details view, right after the net worth trend
   chart): a recharts `BarChart` of total money-out per day, toggleable
   between the current pay period (`currentPayPeriod`) and the current
   calendar month (`currentMonthWindow`), both already in
   `src/lib/pay-period.ts`. **Not** spending-only — this bar shows the same
   whole-ledger daily outflow as the new screen's "Money out" figure,
   bills/debts included. Intentional asymmetry with the Daily Financials
   category section above: there's no adjacent "paid today" list on the
   Dashboard for a bill/debt payment to double up against, so the trend is
   more useful read as real daily burn than as discretionary-only spend.
3. Two new emoji (🐍, 🐱) appended to `CATEGORY_ICONS`
   (`src/lib/visual-meta.ts`) — the household's own nicknames ("vypr" and
   "kitten"). One array already backs both the category icon picker and
   the tag icon picker (`TagDialog` reuses `IconPicker` from
   `app.categories.tsx`), so no other file needed a change for this part.

Reason:
Interviewed via `/plan`. The user wanted a day-level companion to the
existing month/pay-period-level screens (Spending, Monthly Summary,
Paycheck Budget) — nothing in the app answered "what happened on this
specific day" before. Spending-only vs. bills/debts-folded-in for the
category section, and pending-vs-cleared-only for every date filter, were
both explicitly interviewed rather than assumed, given how easy it would be
to silently double-count or under-count against the conventions already
established in `combinedActualByCategory`/`actualByCategoryInRange`/
`buildActualResolver`.

Status: Decided 2026-09-20. Implemented 2026-09-20 — `tsc --noEmit` clean,
243/243 tests pass (8 new), `vite build` succeeds and regenerated
`routeTree.gen.ts` with the new route. Not yet checked in a running
browser — this session's sandbox networking can't reach the dev server;
needs a Codespace or real terminal pass per CLAUDE.md.

