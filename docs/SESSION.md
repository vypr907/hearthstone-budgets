## 2026-07-31 – Account dialog exposes is_spendable and credit_limit

- Account add/edit dialog now has a "Spendable" checkbox bound to `accounts.is_spendable` and a "Credit limit" currency input bound to `accounts.credit_limit`.
- Credit limit only appears when `account_type` is "credit"; it is saved as `null` for other types.
- No balance calculation logic changed.
- Known issues: none new.

## 2026-07-31 – Variable-amount bills and partial payments

- Bill add/edit form has a "Variable amount" toggle (`bills.is_variable_amount`); the amount field relabels to "Typical amount" when on.
- Marking a variable bill submitted/cleared now prompts for the amount owed this cycle (defaults to the remaining owed, else `cycle_amount_due`, else `bills.amount`) and stores it in `cycle_amount_due` on the first payment of the cycle. Fixed-amount bills skip the prompt entirely.
- Clearing a bill payment adds the transaction amount to `cycle_paid_to_date`. Full payment advances `next_due_date`, resets status to `unpaid`, and clears the cycle fields; underpayment keeps status `pending` in the same cycle so a follow-up payment can be submitted.
- Bill cards show "X still owed" and the detail dialog shows Due/Paid/Remaining for the cycle when they differ from `bills.amount`. Undo reverses a partial payment without rolling the cycle back.
- Debt payment logic unchanged.
- Known issues: none new.

## 2026-07-31 – Debt Strategy known_finance_charge simulation fix

- Fixed `src/lib/debt-payoff.ts` so debts with `known_finance_charge` start simulation at `balance + known_finance_charge` and skip `interest_rate` accrual entirely. Previously the charge only overwrote the final displayed interest, so payoff months and rollover timing were wrong. Display logic already used the known charge and is unchanged.

## 2026-07-31 – Debt billing cycles

- Debts now expose `billing_cycle` (monthly/biweekly/quarterly/bimonthly/annually/custom) and `next_due_date` on the list card, detail dialog, and add/edit form (dropdown, defaults to monthly).
- Monthly debts keep `due_day`; non-monthly debts show/edit `next_due_date`, and that date drives overdue status, Everything sorting, and the Dashboard overdue list via the new `debtDueDate()` helper in `src/lib/format.ts`.
- Clearing a non-monthly debt advances `next_due_date` with the shared `advanceDate()` cycle helper (undo reverses it with `reverseDate()`); monthly debts keep the existing reset.
- Known issues: none new.

## 2026-07-31 – Payment Schedule screen and Dashboard charts

- New **Payment Schedule** screen (More → Payment Schedule, `/app/payment-schedule`) showing the next 12 months of debt payments — which debts get paid, how much, remaining balance, and a "Paid off" badge — derived from the household's active strategy and extra monthly payment.
- Each month has a large "Mark paid" check-off. State is stored in a shared `payment_schedule_checkoffs` table if it exists, otherwise device-local storage.
- Dashboard additions: net worth trend line (6 months, per `account_type` plus total), spending-by-category bars for the current month (cleared money-out transactions), and a payoff-progress bar per debt using `(starting_balance - remaining_balance) / starting_balance`.
- New modules: `src/lib/payment-schedule.ts`, `src/lib/net-worth.ts`; new hooks `useScheduleCheckoffs`, `useToggleScheduleCheckoff`, `useAllAccountBalances`.
- Known issue: month check-offs are per-device until the `payment_schedule_checkoffs` table is created in Supabase (SQL noted in TODO.md).
