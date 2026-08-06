## Session Notes

- 2026-08-06 — ADR-040 generalized custom billing cycles. Bill and Debt forms now show a
  number input + Days/Weeks toggle when Billing Cycle = Custom, convert to days on save
  (weeks x 7), block saving without a value, and derive the displayed unit from the stored
  `cycle_interval_days` when editing. `advanceDate()`/`reverseDate()`/`shiftDate()` gained a
  `custom` branch that shifts by `cycle_interval_days`; a null interval throws
  `MissingCycleIntervalError` (surfaced as a toast on payment actions) while render-only
  paths use the new `shiftDateSafe()`. `monthlyEquivalent()` prorates custom cycles as
  `amount * (365.25 / days) / 12`. No backfill: existing custom rows without an interval
  behave exactly as before until edited.
  Known issues: none observed; monthly/biweekly/quarterly/bimonthly/annually paths untouched.
- 2026-08-06 — ADR-041 manual override for spending actuals. Every actual cell on the
  Spending screen is now editable; `spending_actuals.is_manual_override` gives a manual
  total display priority over the ledger sum, saving an edit sets the flag (never touching
  transactions), a one-time confirm warns before overriding a month with logged spend, and
  a pencil indicator on overridden cells reverts to ledger-derived-first.
  Known issues: none observed; Dashboard totals and transaction creation untouched.

- 2026-08-06 — ADR-034 Dashboard rework. Hero now leads with combined spendable balance
  and folds the old "monthly obligations" card in as bills-this-period / debts-this-period
  set-aside totals (paycheck-deducted debts excluded via obligationsInRange). New "Still
  owed this pay period" card groups remaining owed by category with icon + colour accent.
  Net Worth Trend moved to the very bottom. Overdue card now shows billRemainingOwed()/
  debtRemainingOwed() instead of the full amount, and Payoff Progress filters out paid-off
  debts (date_paid_off set or remaining_balance <= 0). Pay period comes from the primary
  income source's latest event, falling back to the calendar month.
  Known issues: none observed.

- 2026-08-06 — ADR-034 budget split. buildActualResolver() now also splits ledger spend
  into ordinary spending vs. payments linked to bills (bill-linked transactions inherit
  the bill's category when the transaction has none), and new billsBudgetedByCategory()
  sums monthlyEquivalent() per category. Spending rows, subtotals and grand total, plus
  the Dashboard budget-vs-actual card, now always show "$X spending + $Y bills = $Z" for
  both Budgeted and Spent; progress/over-under now measures against the combined budget.
  Known issues: manual overrides (ADR-041) report their whole total as spending, since an
  override intentionally replaces the ledger split.

## Backlog (queued 2026-08-06, ordered for independent sessions)

- [x] ADR-040: Generalized custom billing cycle — done 2026-08-06.
- [x] Dashboard bug: Overdue card shows remaining owed — done 2026-08-06.
- [x] Dashboard bug: Payoff Progress excludes paid-off debts — done 2026-08-06.
- [x] ADR-034 fully implemented 2026-08-06 (Dashboard rework + budget/actual bills split).
- [ ] ADR-033 remainder: bill card "Add to envelope" quick-transaction action.
- [x] ADR-041: manual override for spending actuals — done 2026-08-06.
- [ ] Paycheck Budget: allocation sliders show "last month spend" / "avg spend"
      per category.
- [ ] Payment Schedule: collapsible "previous months" section (currently only
      forward-looking 12 months; July fell off after month rollover).
- [ ] Snapshot: balances-by-account-type section, pay-period progress bar,
      buildSnapshotSummary().
- 2026-08-06 — Spending month navigator. Prev/next month arrows above the category list
  (tap the month label to jump back to the current month), defaulting to the real calendar
  month. Rows, subtotals, 3-month average and the ADR-041 edit/override flow all follow the
  selected month; "Start new month" stays anchored to the ledger's newest month and now
  jumps the view to the new month.
  Known issues: none observed; data is already loaded client-side, so no new queries.
