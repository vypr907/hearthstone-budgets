## 2026-07-31 – Debt Strategy known_finance_charge simulation fix

- Fixed `src/lib/debt-payoff.ts` so debts with `known_finance_charge` start simulation at `balance + known_finance_charge` and skip `interest_rate` accrual entirely. Previously the charge only overwrote the final displayed interest, so payoff months and rollover timing were wrong. Display logic already used the known charge and is unchanged.

## 2026-07-31 – Debt billing cycles

- Debts now expose `billing_cycle` (monthly/biweekly/quarterly/bimonthly/annually/custom) and `next_due_date` on the list card, detail dialog, and add/edit form (dropdown, defaults to monthly).
- Monthly debts keep `due_day`; non-monthly debts show/edit `next_due_date`, and that date drives overdue status, Everything sorting, and the Dashboard overdue list via the new `debtDueDate()` helper in `src/lib/format.ts`.
- Clearing a non-monthly debt advances `next_due_date` with the shared `advanceDate()` cycle helper (undo reverses it with `reverseDate()`); monthly debts keep the existing reset.
- Known issues: none new.
