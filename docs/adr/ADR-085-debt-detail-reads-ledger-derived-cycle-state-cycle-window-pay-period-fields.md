## ADR-085: Debt Detail Reads Ledger-Derived Cycle State; Cycle Window + Pay Period Fields
Decision: The Debt detail panel derives "Payment status", "Paid this cycle" and
"Still owed this cycle" from `deriveCycleInfo` (ADR-036) rather than the stored
`payment_status` / `cycle_paid_to_date` columns; a stored `payment_status` that
disagrees is shown only as a secondary "stored: …" note. `CycleInfo` now carries
`windowStart`/`windowEnd`, surfaced as a "Cycle window" field, and a "Pay period"
field shows the primary-paycheck period (ADR-059/060 `periodRange`) containing the
debt's due date.
Reason: A fully-paid monthly debt resets `cycle_paid_to_date` to 0 and has no
`next_due_date` to roll, so the raw columns showed "Pending / $0.00 paid / $106.30
still owed" the day after a full on-time payment — contradicting the list, Everything
and Dashboard screens, which all use the ledger machine. Exposing the window makes
the cycle math auditable instead of implicit.
Status: Decided 2026-08-26. Implemented.

### ADR-085 addendum (2026-08-26): billing-period window + stored-status sync
Decision: The "Cycle window" field shows the debt's billing period (one billing
cycle back from its effective due date, to that due date), with the derivation's
narrower counting range as a secondary line. Where the stored `payment_status`
diverges from the ADR-036 derived state, the detail panel offers a "Sync stored
status" action (`useSyncStoredStatus()`) that writes the derived state and
`cycle_paid_to_date` back onto the row.
Reason: The raw derivation window (e.g. "Aug 18 – Aug 26") is an implementation
detail and read as nonsense; and a backdated payment can leave a stale
"pending" on the row that no screen could repair.
Status: Decided 2026-08-26. Implemented.

### ADR-085 addendum (2026-08-27): month stepper to inspect a prior cycle; Bills detail reaches parity

Decision:
`useCycleState(refDate?)` (`src/lib/ledger-state.ts`) takes an optional reference
date, defaulting to the real today, so every existing call site is unchanged.
`deriveCycleInfo` is already a pure function of its reference date.

The Bills and Debts detail panels gain a **month stepper** (shared
`CycleMonthStepper`) above the cycle figures: ‹ prev / next › with a "This month"
reset. It re-derives the panel's `cycle`/`info` for the selected month (a
`YYYY-MM-15` `refDate`), so "Payment status", "Paid this cycle", "Still owed this
cycle", "Cycle window" and the linked-transaction list all reflect that month.

- **Monthly items only.** A non-monthly item's cycle window hangs off the single
  mutable `next_due_date` pointer with no history, so an older reference date
  can't faithfully reconstruct a past biweekly/weekly/custom window — those
  render one muted line ("Historical cycle view isn't available for non-monthly
  items") instead of the stepper.
- **`refDate` ≠ today disables every write-back of *derived* state:** the "Sync
  stored status" button and `PayActions` / `ArrearsPaymentAction` (Debts) /
  `SetAsideAction` (Bills) are hidden, replaced with a one-line note pointing at
  the per-transaction Correct / Reverse actions. *Ledger-row* actions stay
  enabled — `LogDebtPaymentDialog` (ADR-084, date-driven), `PastDueEditor`,
  `BillAdjustments` / `DebtAdjustments`, and per-transaction Delete / Correct /
  Reverse. `RecentBill/DebtTransactions` scopes to the viewed month.

**Bills detail reaches ADR-085 parity.** It had been showing the raw
`bill.payment_status` column and `billCycleDue`/`billRemainingOwed`; it now
derives its cycle state from `deriveCycleInfo` like the Debts panel, with a muted
`stored: …` line when the two disagree (read-only — no Bills "Sync" button).

Also adds a right-now rollup to both panels (current view only): "Still owed this
cycle" + "Past due (earlier cycles)" (`priorArrearsSummary`, ADR-049 addendum) +
"Total owed".

Reason: `deriveCycleInfo` is always anchored to the real today, so once the
calendar rolls a user can't inspect or correct the prior month's cycle in place.
The stepper restores that without any new persistence.

Status: Decided 2026-08-27. Implemented 2026-08-27. No schema change.

