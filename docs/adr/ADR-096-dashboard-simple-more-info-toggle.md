## ADR-096: Dashboard Simple / More Info Toggle
Decision:
The Dashboard gains a Simple/More Info toggle (`Switch`, remembered per
device in `localStorage`) beneath the Combined Spendable hero. "More Info" is
the existing Dashboard, unchanged, wrapped in a conditional. "Simple" is a
condensed per-pay-period summary: Income this period (every income event in
range, all sources, `inRange`/`eventAmount` from `paycheck-budget.ts`),
Spendable (existing `spendable.total`), Bills/Debts (`periodTotals.bills`/
`.debts` — total due this period — plus paid so far / pending / overdue),
and Spend (budgeted vs. spent, broken into 11 categories groups, reusing the
existing `BudgetTotals`/`BudgetTile`/`BudgetSplitLines` components unchanged
by feeding them a differently-grouped `BudgetGroup[]`).

"Paid so far" / "pending" per bill/debt come from `deriveCycleInfo` (ADR-036)
— the same ledger-derived state used everywhere else in the app, not the
stored `cycle_paid_to_date` column, so it can legitimately read $0 paid on an
item the "Still owed this period" card (which uses the stored column) shows
as partially paid, when a payment predates the cycle's current due-date
window (ADR-085's documented stored-vs-derived divergence — not new to this
feature). "Overdue" reuses the existing household-wide Past Due figure
(ADR-049), filtered by kind — a different scope than "due this period," so
the three sub-figures aren't guaranteed to sum to the total.

The Spend section's 11 groups (Food, Fun, Green, Kitten, Car, Home & Garden,
Personal, Pets, Puff, Savings, Misc) are a new mapping
(`SIMPLE_SPEND_GROUP`, `src/routes/app.index.tsx`), independent of
`categories.parent_category` — a category not listed falls to Misc. Confirmed
with the user: two categories keep their existing `parent_category` grouping
rather than the user's literal wording (Software & Tech → Fun, with its
Entertainment siblings; Shopping → Misc, with its Misc siblings); every other
grouping is a deliberate finer split than `parent_category` (e.g. Green and
Kitten get their own buckets despite sharing a DB parent with Health/Personal
categories).
Reason:
The full Dashboard has grown into ten-plus cards; a quick-glance mode was
requested for a per-paycheck at-a-glance view without navigating away. Reusing
`BudgetTile`/`BudgetTotals`/`BudgetSplitLines` for the Spend section means the
Simple view's category tiles get tap-to-expand transaction drill-down for
free. The category-group mapping is a real, non-obvious business decision
(not derivable from any existing field), hence its own ADR rather than a
SESSION.md-only note.
Status: Decided 2026-09-04. Implemented — `src/routes/app.index.tsx` only, no
schema change, no new files.

Addendum (2026-09-04): **refinement pass after first use.** Toggle enlarged
(`scale-125` switch, `text-base` labels, clickable labels) and the redundant
"Spendable" row dropped from the Income card (the hero above already shows
Combined Spendable). `StatusBreakdownCard` (Bills/Debts) gained a colored
header band (`color-mix(in oklab, <accent> 15%, transparent)`, matching the
existing `app.more.tsx`/`app.bills.tsx` tint convention) with an icon and a
bigger/bolder title, an `ItemBar` (paid/pending vs. total, reusing the same
component `BudgetTotals`/`BudgetSplitLines` already use), a new "Remaining"
row (`Total − Paid`, matching `billRemainingOwed`/`debtRemainingOwed`'s
existing definition — pending doesn't reduce it), and a `HelpButton` on
"Overdue" reusing the exact wording already on the Dashboard's Past Due
section.

The Spend section's tiles switched from the shared `BudgetTile` to a new
**`SimpleSpendTile`** — same collapsed ring/header (still spending-only, so
the numbers read correctly with no bills/debts noise), but tapping it shows
an institution-by-institution breakdown of that group's spending this period
instead of `BudgetTile`'s `BudgetSplitLines` (Spending/Bills/Debts split,
pointless here since Simple's groups are spending-only). The breakdown
mirrors `app.spending-by-place.tsx`'s row exactly (logo/icon, name, amount,
proportional share bar), filtering `transactions` to the group's
`categoryIds` within the period and excluding internal transfers via
`internalTransferIds` (ADR-089) — computed inline in the tile, not extracted,
since nothing else needs a category-set + custom-date-range version of
Spending by Place's logic. `BudgetTile` itself is untouched — More Info's
"Budget vs actual" card still uses it unchanged.

Addendum (2026-09-04): **bugfix — the institution breakdown was including
bill/debt payments.** A bill/debt payment transaction can carry the same
`category_id` as a group's spending categories (e.g. a real household's ATT
or Google One bill filed under "Home & Garden" alongside real Home & Garden
spending), and `SimpleSpendTile`'s institution breakdown matched on
`category_id` alone — so it wrongly listed the bill's institution next to
genuine spending places, even though the tile's own total already correctly
excluded that money (via `actualByCategoryInRange`'s `spendingSpent` field).
Fixed by skipping any transaction with `linked_bill_id`/`linked_debt_id` set
in the breakdown loop, mirroring the same distinction
`actualByCategoryInRange` already makes. Reported by the user via a
screenshot (`planning/image.png`) showing ATT and Google One next to Fred
Meyers under "Home & Garden."

Addendum (2026-09-04): **Income card + pay-period range.** The Income row
moved out of the plain Income/Spendable card into its own card with a
green-tinted header (`color-mix(in oklab, var(--state-cleared) 15%,
transparent)`, same convention as the Bills/Debts `StatusBreakdownCard`
headers), an icon, and a larger `text-2xl` figure — more visually
prominent per the user's request. A new centered line
(`formatWindow(period.start, period.end)`, existing helper from
`src/lib/format.ts`, already used for "Pay period"/"Cycle window" fields
elsewhere) sits between the toggle and the Income card, showing the pay
period's date range (e.g. "Aug 21 – Sep 4, 2026").

