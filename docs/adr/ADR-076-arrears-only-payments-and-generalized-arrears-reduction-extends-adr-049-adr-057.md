## ADR-076: Arrears-Only Payments and Generalized Arrears Reduction (Extends ADR-049, ADR-057)

Decision:
1. New `applyArrearsPayment(p: Payable, amount: number, date: string, accountId: string)`
in `payments.ts`. Caps `amount` at `computeArrears(p).amountOverdue` (mirrors ADR-057's
cap pattern). Writes a cleared, linked transaction for the amount/date/account, tagged
`resolved_cycle_due_date` (ADR-075) with `arrears.oldestMissedDate ?? ` the cycle's own
open-start date — so it's excluded from the current cycle's ledger-derived window and
never shows up as if it paid the current cycle. Never touches `cycle_paid_to_date`.
2. Consolidates the payable's `opening_arrears`/`arrears_as_of` on every arrears-directed
credit (this new action AND the existing ADR-057 overflow-on-clear path):
`new_opening_arrears = max(0, computeArrears(p).amountOverdue - amountCredited)`,
`arrears_as_of = today`, regardless of whether `opening_arrears` was already > 0. This
replaces ADR-057's `openingArrears > 0` gate, which silently no-oped whenever arrears
came entirely from the live missed-cycle walk rather than a manual carry-in figure.
3. New "Log arrears payment" UI action (PayActions-adjacent, shown only when
`computeArrears().amountOverdue > 0`): prompts amount (default = arrears total, capped),
backdatable date, account. Usable repeatedly — each call is an independent, separately
dated ledger entry, so it doubles as bulk historical-payment entry.

Reason:
Bills/debts overdue by missed cycles (not manual carry-in) had no way to be paid down
independently of the current cycle — every payment credited the current cycle first
(ADR-057), with no path to target arrears alone. Building that action exposed that
ADR-057's overflow-reduction was already broken for this exact case: it only reduces
`opening_arrears` when `opening_arrears > 0`, so a bill 3 cycles overdue purely from
missed payments (no manual carry-in) had a "Total due" preset that included the live
missed-cycle walk's amount but a clear that couldn't reduce it — paying the shown "Total
due" figure would still show cycles as overdue afterward. Consolidating the live walk
into `opening_arrears` at the moment of any arrears-directed credit (rather than only
ever subtracting from a pre-existing manual figure) fixes both problems with one
mechanism.

Scope note: only the amount actually credited toward arrears reduces `opening_arrears`;
a partial arrears payment consolidates the current total first, then subtracts, so a $50
payment against $300 in live missed-cycle arrears correctly leaves $250 (not $0, and not
silently un-reduced).

Extends: ADR-049, ADR-057, ADR-075.

Status: Decided 2026-08-21. Implemented 2026-08-21. No schema change — reuses
opening_arrears/arrears_as_of/resolved_cycle_due_date.

