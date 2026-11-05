## ADR-031: Institution-Level Balance & Due Aggregation

Decision:
Institutions display two computed (not stored) figures, definition depends on
institution type:

- **Account-bearing institutions** (bank, credit_card, financial — anything
  with accounts underneath): Current Balance = sum of linked accounts' current
  balance (reusing balances.ts's existing per-account formula). Current Due is
  not shown for this type — a bank isn't "due" anything as a household obligation.

- **Bill/debt institutions** (utility, subscription, medical, lendor_lessor,
  tool, or any institution with no accounts underneath): Current Balance =
  total still owed across everything linked — sum of debts.remaining_balance
  for linked debts, plus sum of open bill cycle amounts (cycle_amount_due if
  set, else amount) for linked bills that aren't fully paid. Current Due =
  just the currently unpaid cycle's amount: for bills, the same open-cycle
  amount minus cycle_paid_to_date (ADR-019); for debts, minimum_payment for
  the current due period. This is a subset of Current Balance, not a separate
  total.

Both figures are computed live at render time, consistent with ADR-015/ADR-020's
rule against caching anything that changes on every edit — no new columns.

Reason:
A bank's "balance" and an unpaid medical bill's "amount owed" are different
concepts that happened to share a UI slot request — separating Current Balance
(total exposure) from Current Due (what's actionable right now) matches how
Bills/Debts already distinguish total remaining vs. this-cycle's amount
(ADR-019), rather than inventing a third definition.

Status: Decided 2026-08-03. Implemented 2026-08-03 in
`computeInstitutionTotals()` (src/lib/balances.ts), rendered on the Institutions
list rows and detail view. Debts count toward Current Due when debtDueDate()
(ADR-017) is on or before today; bills use billCycleDue()/billRemainingOwed()
(ADR-019). Institutions with neither accounts nor obligations render "—".

