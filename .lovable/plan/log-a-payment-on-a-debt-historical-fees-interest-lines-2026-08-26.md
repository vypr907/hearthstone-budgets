# Log a payment on a debt (historical + fees/interest lines)

Add a "Log a payment" button on the Debt detail view that opens one form where you enter
the payment date, the principal amount, the paying account, and any number of
fee/interest lines — all saved together.

## What the form does

Fields:
- Date (defaults to today)
- Paying account (defaults to the account that last paid this debt, same default as the
  existing pay flow)
- Principal amount (pre-filled with what's owed this cycle)
- Extra lines: add/remove rows for fee, interest, late fee, etc. Each line has a type,
  amount and optional note.
- Status: cleared (default) or pending

Behaviour on save:
- **Principal** reduces the debt's balance. Whether it also touches the current cycle is
  decided by the date you enter:
  - Date falls inside the current cycle window (from the previous due date up to the
    current `next_due_date`) → treated exactly like a normal payment: updates
    `cycle_paid_to_date`, payment status, and rolls the due date when fully paid.
  - Date is earlier than that window → backfill only: writes the ledger transaction and
    reduces `remaining_balance`. Cycle fields, due date and payment status are left alone.
    The form shows which mode it's in ("Applies to current cycle" vs "Historical — balance
    and ledger only") so there's never a surprise.
- **Fee/interest lines** each get their own transaction charged to the same account, so
  the account balance is correct, but they do **not** change the debt balance (matching the
  ADR-046 fee pattern; proper interest handling is deferred).
- All rows (principal + lines) share one `split_group_id` so clearing, reversing or
  deleting the payment carries its fees with it.
- Backdating warning: if the date is older than the debt's most recent entry, the same
  out-of-order confirmation used by the Adjustments section appears first.

## Technical notes

- New component `src/components/LogDebtPaymentDialog.tsx`, rendered from the debt detail
  section in `src/routes/app.debts.tsx` next to `PayActions`.
- New mutation `useLogDebtPayment()` in `src/lib/payments.ts`. It reuses
  `applyClearedPayment()` for the in-cycle path and a narrow balance-only update for the
  historical path; fee rows go through the existing `writeFeeRow`/split-group helper so
  ADR-046 pairing is unchanged.
- Cycle-window test: `shiftDateSafe(next_due_date, billing_cycle, -1, cycle_interval_days)`
  gives the window start; the debt's `next_due_date` is the end.
- Payable-first write ordering (ADR-037) is preserved: the debt row updates before any
  transaction is inserted.
- No schema change required.

## Docs

Append to `docs/SESSION.md`; add an ADR in `docs/DECISIONS.md` for the date-driven
in-cycle vs historical rule and the "fees never affect debt balance" decision (extends
ADR-046 — confirm the number before writing).
