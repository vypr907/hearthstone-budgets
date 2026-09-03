# SESSION.md

## Session Notes

- Advance historical-payment fix + Cleo/Instacash untangle + credit categories +
  debt-detail polish (ADR-084 addendum / ADR-056 addendum).
  * **`useLogDebtPayment`** — a historical payment on an advance debt dated before
    its newest advance is ledger-only (skips `remaining_balance` /
    `advanceMinimumPaymentPatch` / `debtPayoffDatePatch`, still writes the txn).
    New `isPreAdvanceHistoricalPayment()`; `LogDebtPaymentInput.newestAdvanceDate`;
    return now `{ inCycle, ledgerOnly }`.
  * **`LogDebtPaymentDialog`** — loads `useDebtAdjustments`, derives
    `newestAdvanceDate`, passes it, and swaps hint/principal-note/toast when the
    ledger-only path is active.
  * **`useCreateAdvance`** — deposit txn now also carries `linked_debt_id` (shows
    in the debt's Recent Transactions). New shared `isAdvanceDisbursement(t)`
    excludes that row from `deriveCycleInfo` cycle math (`ledger-state.ts`), the
    Debt Strategy payment-history tally (`app.debt-strategy.tsx`), and the
    Correct/Reverse actions on the debt-detail row.
  * **`RecentDebtTransactions`** (`app.debts.tsx`) — rows are now tappable →
    `TransactionDetail` dialog (mirrors `RecentBillTransactions`); the
    disbursement row shows an "advance" label and hides Correct/Reverse.
  * Tests: `payments.test.ts` (+`isPreAdvanceHistoricalPayment`,
    `isAdvanceDisbursement`), `ledger-state.test.ts` (+disbursement exclusion).
    Suite 168 → 175. typecheck / build / test green; touched files no new lint.
  * **SQL for the user to run** (`scripts/migrations/2026-09-04-*.sql` + verify):
    - `cleo-instacash-untangle.sql` — delete the mis-entered 8/14 $5.99+$1 split;
      add the missing 8/3 Cleo Plus bill payment; add the $6.99 Cleo Express Fee
      on the advance; link the Cleo advance deposit + name the repayment; unlink
      the Instacash 7/17 $443.03 payment and reset Instacash to $600/$600;
      backfill `linked_debt_id` on all advance deposits. **Leaves a ~$234.90
      Instacash residual for the user to reconcile against MoneyLion.**
    - `credit-categories.sql` — Cash Back / Rewards (income), Interest Earned
      (income), Interest Charge (spending/Financial).
  * Branch `feat/advance-historical-payment`.
  * Deferred: account detail dialog (own ADR); "Log a historical bill payment"
    dialog; the Instacash $234.90 reconciliation.
