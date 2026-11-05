## ADR-109: Reverse-Direction Transfer from an Opaque Account Counts as Income (Year in Review only)

Decision:
ADR-107 deferred this as a separate feature — "money coming back" from a
flagged/opaque personal account (`accounts.transfers_count_as_spend`) stayed
a neutral, excluded internal transfer everywhere, since none of the spend
calculators had an "income" counterpart a positive leg could feed into.

- New `reverseOpaqueTransferIds(transactions, opaqueAccountIds)`
  (`src/lib/internal-transfers.ts`), symmetric to `internalTransferIds`'s
  existing `posOnOpaque` carve-out: returns the subset of two-sided
  transfer `transfer_group_id`s whose *negative* (sending) leg's account is
  opaque — i.e. exactly the pairs ADR-107 left neutral.
- Scoped to **Year in Review's Income vs. Expenses chart only**
  (`monthlyIncomeVsExpenses`, `src/lib/paycheck-budget.ts`), not the
  Dashboard's "Income this period" tile (event-sourced from income
  sources/events, not the ledger — a different data model entirely) or
  Monthly Summary (category-spend-only today, no income concept to plug
  into). Interviewed rather than assumed, since the issue explicitly left
  this open. `monthlyIncomeVsExpenses` gained an `accounts` parameter
  (default `[]`, so every other existing caller/test is unaffected); the
  receiving leg of a reverse-opaque transfer now adds to that month's
  `income` total.
- **Bug fix bundled in, not scope creep — required for #74 to be correct**:
  `monthlyIncomeVsExpenses` was the only calculator in the codebase that
  never excluded two-sided internal transfers at all (no `accounts`/
  `internalTransferIds` awareness, unlike `actualByCategoryInRange`/
  `combinedActualByCategory`/`buildActualResolver`). An ordinary transfer's
  uncategorized negative leg (e.g. paycheck → savings) was falling through
  to the generic amount-sign logic and counting as an "expense." Left
  unfixed, this session's change would have made a reverse-opaque transfer
  count as *both* an expense (the pre-existing bug) *and* income (the new
  feature) — worse than doing nothing. Now: any transfer group in
  `internalTransferIds(transactions, opaqueTransferAccountIds(accounts))` is
  skipped entirely (both legs), except a `reverseOpaqueTransferIds` group's
  positive leg, which is added to `income`. A transfer *into* an opaque
  account (ADR-107's original, forward direction) is unaffected by this —
  it was never in the "internal" set to begin with, so it still falls
  through to the generic logic and counts as an expense there too, same as
  every other spend calculator.

Reason:
Symmetric handling was the user's original preference in ADR-107, deferred
only because the income path didn't exist yet. Year-in-Review-only was
chosen over also touching the Dashboard tile or Monthly Summary because
those two aren't ledger-derived (or have no income row at all) — folding a
transfer-derived number into either would mean either blending two
different data models into one figure (Dashboard) or introducing a new row
to a card that's never shown one (Monthly Summary), both bigger and riskier
than the smallest change that actually closes the issue.

Status: Decided 2026-09-24. Implemented 2026-09-24 — `tsc --noEmit` clean,
246/246 tests pass (3 new, covering the ordinary-transfer exclusion,
reverse-opaque income, and forward-opaque expense cases). Not yet checked
in a running browser — needs a Codespace or real terminal pass per
CLAUDE.md.

