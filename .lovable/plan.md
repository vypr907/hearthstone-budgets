# Debt detail: show the cycle window, the pay period, and trustworthy cycle status

## The problem

On "Aarons - Dresser" the detail panel says Payment status **Pending**, Paid this cycle **$0.00**,
Still owed this cycle **$106.30**, while a cleared **-$106.30** payment dated 2026-08-21 sits right
below it on a monthly debt due on the 21st.

Those three fields are read straight off the debt row (`payment_status`, `cycle_paid_to_date`,
`minimum_payment - cycle_paid_to_date`). They are not the ledger-derived state ADR-036 defines,
which is what the Debts list, Everything screen and dashboard use. Two known ways the stored
columns end up looking like this on a monthly debt:

- A fully-covered monthly cycle deliberately resets `cycle_paid_to_date` to 0 (there is no
  `next_due_date` to roll), so "Paid this cycle $0.00 / Still owed $106.30" is what the raw
  columns always show after a full payment.
- The historical (backdated) branch of "Log a payment" writes only the balance and leaves
  `payment_status` at whatever it was — so a stale "pending" can survive a cleared payment.

Which of the two produced this exact row is not yet confirmed, so step 1 is to read the debt row
and its linked transactions before changing any math.

## Plan

1. **Verify first.** Query this debt's `payment_status`, `cycle_paid_to_date`, `next_due_date`,
   `due_day`, `minimum_payment` and its linked transactions, and run the same inputs through
   `deriveCycleInfo` to confirm the ledger says "cleared" while the row says "pending".

2. **Make the detail panel show the derived state, not the raw columns.**
   Payment status, Paid this cycle and Still owed this cycle come from `deriveCycleInfo`
   (the ADR-036 machine) so the detail agrees with every other screen. Where the stored
   `payment_status` disagrees with the ledger, show it as a small secondary note rather than the
   headline value, so a stale row is visible instead of misleading.

3. **New field: Cycle window.** Displays the exact date range the math is using, e.g.
   `Jul 21 – Aug 21, 2026`, taken from the same window `deriveCycleInfo` computes (one billing
   cycle back from the due date, to the due date). This is the transparency you asked for — you
   can see at a glance which payments should count.

4. **New field: Pay period.** Displays which primary-paycheck pay period the debt's due date falls
   into, e.g. `Aug 21 – Sep 4`, using the existing `periodRange`/`inRange` helpers from the
   Paycheck Budget. Blank when there is no primary income source or no paycheck covering the date.

5. **Fix whatever step 1 turns up.** If it's the stale-`payment_status` write, the historical
   branch of `useLogDebtPayment` gets corrected; if it's purely a display issue, step 2 already
   resolves it.

## Technical notes

- Detail fields live in `src/routes/app.debts.tsx` around lines 410–480; the cycle window helper
  already exists as `debtCycleWindowStart()` in `src/lib/payments.ts` and the derived state as
  `deriveCycleInfo`/`useCycleState` in `src/lib/ledger-state.ts`. Nothing new is computed — the
  same helpers are surfaced.
- Pay-period lookup reuses `periodRange` + `inRange` from `src/lib/paycheck-budget.ts` against the
  existing income-events query.
- No schema change.

## Docs

Append to `docs/SESSION.md`; new ADR in `docs/DECISIONS.md` for "debt detail reads ledger-derived
cycle state, and exposes the cycle window + pay period" (extends ADR-036 — confirm the next number
before writing).
