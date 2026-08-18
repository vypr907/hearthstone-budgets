# Payment Reversal Tool (ADR-070)

Add a way to undo a cleared bill/debt payment from the Bill or Debt detail view, without deleting history: the original payment stays, and an offsetting reversal entry is written while the bill/debt is rolled back.

ADR-070 already exists in docs/DECISIONS.md — no new ADR will be created.

## What the user sees

- In "Recent transactions" on Bill detail and Debt detail, cleared payment rows gain a **Reverse** button beside the existing trash button, same icon-button style.
- It appears only for rows that are cleared, linked to that bill/debt, and are money out (negative amount).
- Tapping it opens a confirm dialog: "Reverse this payment? This will undo it as if it never cleared." with an optional date field defaulting to today (when the reversal actually happened).
- On confirm: a toast confirms success; the bill/debt figures and the transaction list refresh immediately.

## Behaviour on confirm (strict order)

1. **Bill-linked**: set `cycle_paid_to_date = max(0, cycle_paid_to_date - abs(amount))`. If the new value is below `cycle_amount_due ?? bills.amount`, also set `payment_status = 'unpaid'`.
2. **Debt-linked**: set `remaining_balance += abs(amount)` and `cycle_paid_to_date = max(0, cycle_paid_to_date - abs(amount))`, same `payment_status` reset rule, and clear `date_paid_off` if it was set.
3. **Only after** the payable write succeeds, insert the reversal transaction: same `household_id` and `account_id`, `amount = -original.amount`, `status = 'cleared'`, same `linked_bill_id`/`linked_debt_id`, `description = "Reversed: <name> payment"`, `transaction_date` = the dialog date.
4. The payable write uses the existing `updateRow()` guard (`.select("id")` + throw on 0 rows), so a blocked/silent payable write aborts before any reversal row is written — never an orphan ledger entry (ADR-037).

## Technical notes

- New `reversePayment(transaction, payable, reversalDate)` in `src/lib/payments.ts`, reusing the module's existing private `updateRow()` helper; no new payment/ledger table (ADR-003), and the reversal is a plain unlinked-to-fee ledger row like ADR-046 fee rows.
- New `useReversePayment()` mutation in `src/lib/data-hooks.ts` next to `useDeleteLinkedTransaction`, invalidating `transactions`, `bills`, `debts`.
- UI changes confined to `RecentBillTransactions` in `src/routes/app.bills.tsx` and `RecentDebtTransactions` in `src/routes/app.debts.tsx`: an `Undo2` icon button plus a small shared confirm dialog with a date input.
- Cycle state stays derived (ADR-036) — nothing writes a state flag beyond the `payment_status` reset the ADR specifies.
- No schema changes.

## Docs

- Append a SESSION.md bullet describing the change, files touched, and ADR-070/037/046 references.
