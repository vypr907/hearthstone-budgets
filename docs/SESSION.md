## Session Notes
## Backlog (queued 2026-08-06, ordered for independent sessions)

- [ ] ADR-037: Generalized custom billing cycle (cycle_interval_days on bills/debts;
      generalize advanceDate/reverseDate/monthlyEquivalent). Supersedes the
      every_4_weeks-enum option — chosen for future oddball cadences.
- [ ] Dashboard bug: Overdue card shows full bill/debt amount instead of remaining
      owed (reuse billRemainingOwed()/debtRemainingOwed() from ADR-035).
- [ ] Dashboard bug: Payoff Progress card includes paid-off debts (needs same
      remaining_balance > 0 filter as Debts list).
- [ ] ADR-034 (decided, not implemented): Dashboard hero rework, budget/actual
      bills split, owed-this-period card, Net Worth Trend moved to bottom.
- [ ] ADR-033 remainder: bill card "Add to envelope" quick-transaction action.
- [ ] ADR-038 (not yet drafted): manual override for past-month spending actuals —
      editing a month's actual total should NOT also sum ledger transactions for
      that month; treat manual edit as authoritative, amends ADR-012.
- [ ] Paycheck Budget: allocation sliders show "last month spend" / "avg spend"
      per category.
- [ ] Payment Schedule: collapsible "previous months" section (currently only
      forward-looking 12 months; July fell off after month rollover).
- [ ] Snapshot: balances-by-account-type section, pay-period progress bar,
      buildSnapshotSummary().