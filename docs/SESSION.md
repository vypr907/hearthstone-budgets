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
## Backlog (queued 2026-08-06, ordered for independent sessions)

- [x] ADR-040: Generalized custom billing cycle — done 2026-08-06.
- [ ] Dashboard bug: Overdue card shows full bill/debt amount instead of remaining
      owed (reuse billRemainingOwed()/debtRemainingOwed() from ADR-035).
- [ ] Dashboard bug: Payoff Progress card includes paid-off debts (needs same
      remaining_balance > 0 filter as Debts list).
- [ ] ADR-034 (decided, not implemented): Dashboard hero rework, budget/actual
      bills split, owed-this-period card, Net Worth Trend moved to bottom.
- [ ] ADR-033 remainder: bill card "Add to envelope" quick-transaction action.
- [ ] ADR-041: manual override for past-month spending actuals —
      editing a month's actual total should NOT also sum ledger transactions for
      that month; treat manual edit as authoritative, amends ADR-012.
- [ ] Paycheck Budget: allocation sliders show "last month spend" / "avg spend"
      per category.
- [ ] Payment Schedule: collapsible "previous months" section (currently only
      forward-looking 12 months; July fell off after month rollover).
- [ ] Snapshot: balances-by-account-type section, pay-period progress bar,
      buildSnapshotSummary().