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
- [x] ADR-033 remainder: bill card "Add to envelope" quick-transaction action — done 2026-08-06.
- [x] ADR-041: manual override for spending actuals — done 2026-08-06.
- [x] Paycheck Budget: allocation sliders show "last month spend" / "avg spend"
      per category — done 2026-08-06 (ADR-042).
- [x] Payment Schedule: collapsible "previous months" section — done 2026-08-06
      (ADR-042).
- [x] Snapshot: balances-by-account-type section, pay-period progress bar,
      buildSnapshotSummary() — done 2026-08-06.
- 2026-08-06 — Spending month navigator. Prev/next month arrows above the category list
  (tap the month label to jump back to the current month), defaulting to the real calendar
  month. Rows, subtotals, 3-month average and the ADR-041 edit/override flow all follow the
  selected month; "Start new month" stays anchored to the ledger's newest month and now
  jumps the view to the new month.
  Known issues: none observed; data is already loaded client-side, so no new queries.

- 2026-08-06 — ADR-033 bill card "Add to envelope". `SetAsideAction` gained a `compact`
  variant (small PiggyBank button) rendered on each bill card in the Bills list, below the
  pay actions and click-isolated from the card's detail-open handler. It reuses the exact
  ADR-038 two-transaction Set Aside flow (cleared debit from the source account + cleared
  credit tagged `linked_goal_id`), so setting money aside never touches the bill's own
  pay/clear state. Cards for bills without a linked envelope goal render nothing.
  Known issues: none observed.

- 2026-08-06 — ADR-028 Status Snapshot additions. New "Balances" card shows per-account-type
  subtotals (checking, savings, credit, investment, retirement, plus any other types) using
  the existing balances.ts spendable formula, headlined by the ADR-023 combined spendable
  total. New pay-period card shows a progress bar of amount covered vs. still owed for the
  current pay period (falls back to the calendar month when no primary income event covers
  today), reusing obligationsInRange() and the ADR-035 remaining-owed helpers. New rule-based
  `buildSnapshotSummary()` in src/lib/snapshot.ts renders a plain-text paragraph covering
  obligations vs. spendable, overdue items and comfortable surplus; it is a pure function
  with no network call so it can be swapped for an LLM version later.
  Known issues: none observed; snapshot export path unchanged.

- 2026-08-06 — ADR-042. Paycheck Budget allocation rows now show "Last month $X · 3-mo
  avg $Y" per category (buildActualResolver over spending actuals + transactions, so
  manual overrides are respected) with a "Use avg" link that commits the rounded average.
  Payment Schedule gained a collapsible "Previous months" card covering the last 6 months
  plus any older checked-off month, each with its Mark paid toggle.
  Known issues: past months show no per-debt breakdown by design — balances have moved on.
