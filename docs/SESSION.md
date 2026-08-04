## Session Notes

- ADR-032 implemented (partly): `debts.is_paycheck_deduction` toggle on the debt
  form, badge on Debts list + detail, excluded from `obligationsInRange()` and
  listed separately via `deductedObligationsInRange()` in the Paycheck Budget
  "Due this period" card ("Paycheck-deducted (not counted)").
- Debts: payments that zero `remaining_balance` now set `date_paid_off` (payments.ts);
  Debts list hides zero-balance debts behind a "Show paid off" switch and sorts them
  to the bottom showing the paid-off date; Billing Cycle labels title-cased; debt
  detail gained a "Recent transactions" section (last 10 by `linked_debt_id`).
- ADR-033 (partly): `monthlyEquivalent()` / `needsEnvelope()` added to format.ts;
  `useUpsertBill()` now returns the saved row and auto-creates one
  `savings_goals` envelope (`linked_bill_id`) for quarterly/bimonthly/annual bills;
  goal form can link an optional `account_id`; envelope goals flagged in the list.
- Add Transaction + pay-time picker: account labels now show
  "{name} - {institution} - •••{last4}"; the picker shows the account-type icon and
  an institution-logo badge (`accountLast4`, `accountLabel`, `accountTypeVisual`).

### Known issues / not yet done in this batch
- Dashboard hero rework, budget/actual bills split, "owed this pay period by
  category" card, and moving Net Worth Trend to the bottom (ADR-034) — pending.
- Spending screen "Budgeted: $X spending + $Y bills = $Z" split — pending.
- Bill card "Add to envelope" quick-transaction action — pending.
- Status Snapshot balances section, pay-period progress bar, and
  `buildSnapshotSummary()` — pending.
