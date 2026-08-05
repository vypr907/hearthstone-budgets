## Session Notes

- Docs pass: SESSION.md content for 2026-08-04 summarized into CHANGELOG.md (4 entries),
  CONTEXT.md status/decisions/rules refreshed, SESSION.md reset.
- ADR-035 implemented: universal partial payments.
  - `payments.ts`: `debtCycleDue`/`debtRemainingOwed`/`payableRemainingOwed`, shared
    `applyClearedPayment()`, `ensureCycleAmount()`; submit always writes a new pending
    transaction (so a pending item can take another partial payment) and fixed bills get
    `cycle_amount_due` set automatically on the first submit of a cycle.
  - Debts now track `cycle_paid_to_date`; cycles resolve only at >= minimum_payment, and
    Undo reverses partial credits.
  - `pay-flow.tsx`: two-stage prompt — variable-bill "owed this cycle" (unchanged) then a
    universal "how much are you paying now?" defaulting to remaining owed.
  - "$X still owed this cycle" now shows on Bills list/detail, Debts list/detail and Everything.
  - Bill detail gained a Recent transactions section (last 10 by `linked_bill_id`).
  - Add Transaction gained an optional "Link to bill/debt" selector routed through
    `applyClearedPayment()`.
