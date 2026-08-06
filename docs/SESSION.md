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

## Backlog (queued 2026-08-06, ordered for independent sessions)

- [x] ADR-040: Generalized custom billing cycle — done 2026-08-06.
- [ ] Dashboard bug: Overdue card shows full bill/debt amount instead of remaining
      owed (reuse billRemainingOwed()/debtRemainingOwed() from ADR-035).
- [ ] Dashboard bug: Payoff Progress card includes paid-off debts (needs same
      remaining_balance > 0 filter as Debts list).
- [ ] ADR-034 (decided, not implemented): Dashboard hero rework, budget/actual
      bills split, owed-this-period card, Net Worth Trend moved to bottom.
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
