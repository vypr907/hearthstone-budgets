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
- ADR-036 implemented: ledger-derived 4-state payment cycle (supersedes ADR-010).
  - `ledger-state.ts`: pure `deriveCycleInfo()` + `useCycleState()` returning
    { state, due, clearedSum, remaining, transactions, pending, resolved };
    states are unpaid / pending / partial / cleared. A resolved cycle is detected by
    looking back one interval, since clearing advances the due date.
  - `payments.ts`: new `useResetCycle()` — deletes every transaction in the resolved
    cycle, zeroes cycle_paid_to_date, reverts payment_status and next_due_date
    (extends ADR-008 to multi-transaction cycles).
  - `pay-flow.tsx`: `tap(payable, info)` drives the machine — unpaid/partial prompt for
    an amount and create a pending tx, pending clears the latest pending tx on its own
    account (no re-prompt), cleared shows the "undo all payments this cycle?" confirm.
  - `PayActions` is now a single state-aware button used by Bills and Debts; Everything's
    tap icon uses the shared `stateVisual()` (unpaid neutral, pending yellow clock,
    partial orange, cleared green check) via new `--state-*` tokens in styles.css.
  - `src/lib/ledger-state.test.ts` covers the Rent 2 case ($609: 500 pending → partial
    $109 remaining → 109 pending → cleared/rolled → reset deletes both transactions).

Known issues: end-to-end verification in the live app wasn't possible (external Supabase,
no injectable session); logic is covered by the unit test above.

