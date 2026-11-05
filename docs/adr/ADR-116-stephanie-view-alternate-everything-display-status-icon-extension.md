## ADR-116: "Stephanie View" — Alternate Everything Display + Status-Icon Extension

Decision:
A new toggleable display mode on `/app/everything` (net-new `Tabs`/
`ToggleGroup` in `EverythingPage()` — no existing view-mode mechanism was
there to extend) showing, per row: a 4-state status icon, name + category/
type subheading, due date, amount owed (run through `monthlyEquivalent()`),
total owed (debts only, via `effectiveDebtBalance()`), and institution-level
login info (`institutionIndex[...].login_username`/`.sign_in_with_google`
— already loaded on Everything, zero new fetches). Default sort by due
date; reuses `ListControls`'s existing search input verbatim.

The status icon extends `stateVisual()`'s existing 4-state model
(ADR-036: unpaid/pending/partial/cleared) with two states it doesn't
cover — "issue" (yellow caution, driven by `computeArrears`/
`priorArrearsSummary` resolving to any overdue amount > 0) and "due" (blue
`CalendarClock`, a new helper for "unpaid, no arrears, due date has
arrived/passed into the current cycle" — including the auto-flip from
"paid" to "due" on the 1st of the month for monthly items). User-confirmed
priority when states overlap: Issue > Pending > Due > Paid.

Reason:
The user wants a simpler, read-only-friendly view of the household's bills/
debts for their spouse — fewer controls, clearer at-a-glance status, and
sign-in info so a bill can actually be paid without asking where to log in.
Building it as a toggle on the existing Everything screen (rather than a
new route) keeps one source of truth for the underlying row data; the two
new status states were a genuine gap, not a reuse of anything that already
existed, since ADR-036's 4 ledger states track payment-cycle state, not
calendar-driven "is this now due" or arrears-driven "is this a problem."

Status: Decided 2026-11-05. Implemented 2026-11-05 — `tsc --noEmit` clean,
283/283 tests pass. The two new states ("issue"/"due") use plain Tailwind
colors (`text-amber-500`/`text-sky-500`), not the per-theme `--state-*` CSS
tokens the 3 reused states ride on (`stateVisual()`'s `pending`/`partial`/
`cleared`) — adding 2 new tokens across all ~8 theme variants in
`src/styles.css` was judged disproportionate scope for an icon-color choice
on one view; a deliberate simplification, not an oversight. Not yet checked
in a running browser.
