## Session Notes

### 2026-08-14
- Fixed invoice payments not updating status on Everything: `deriveCycleInfo()`
  windowed linked transactions to (next_due_date − 1 cycle, today]. One-time
  invoice cycles never shift, so that window was empty and every payment fell
  outside it — state stayed "unpaid" even though the write succeeded. One-time
  payables now use all linked transactions as their single open cycle.
  (`src/lib/ledger-state.ts`)
- Debt form: Starting balance moved before Remaining balance; remaining and
  minimum payment mirror starting balance until edited; interest rate is
  optional and stores null when blank. (`src/routes/app.debts.tsx`)
- Debt form: Type and Institution dropdowns show emoji/logo icons (reusing
  `institutionTypeVisual` / `InstitutionLogo`) with h-14 tap targets.
  (`src/routes/app.debts.tsx`)

Known issue: none from this pass.
