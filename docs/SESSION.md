## Session Notes

- Found and fixed a bill-side variant of the ADR-037 stranded-payment bug: the
  Transactions screen's edit dialog let a linked transaction's amount/status be
  changed via plain `useUpsertTransaction()`, bypassing `applyClearedPayment()` —
  so flipping a linked row to cleared there (instead of via the bill/debt's Pay
  actions) left `cycle_paid_to_date` stuck while the ledger showed the money
  cleared. Confirmed live on the "Beiers" bill (cleared $108.39 txn, cycle_paid_to_date
  still 0, still shown "$108.39 past due"). Files: `src/routes/app.transactions.tsx`
  (amount/status now disabled on linked rows), new `src/components/StrandedBillRepair.tsx`
  (bill-side repair scan mirroring `StrandedDebtRepair`, mounted on the Bills screen).
  ADR-037 addendum documents both. Known issue: existing desynced bill rows (Beiers
  confirmed, Rent flagged for review — see TODO) aren't retroactively fixed by this
  change; use the new Bills-screen repair panel to clean them up.
  - Next step: run the app, confirm the Bills screen surfaces Beiers under "Stranded
    bill payments found," and use "Clean up" + redo the payment to verify end to end.
    Build can't be verified locally (AppLocker blocks vite/tsc) — flagging for manual
    smoke test.

- Bill detail's "Recent transactions" rows (`RecentBillTransactions`, `app.bills.tsx`)
  now show a small account icon/label (reusing `ObligationIcon` at 16px, keyed off the
  transaction's `account_id` → account → institution) and are clickable to open the
  shared `TransactionDetail` dialog (reused from `app.transactions.tsx`, same component
  already reused on the Accounts screen). Delete/Reverse buttons stop propagation so
  they don't also trigger the row click. No schema change. Build unverified locally
  (AppLocker) — flagging for manual smoke test on the Bills detail screen.
