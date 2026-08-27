# TSP Loan / TSP Loan 2 show unpaid despite the 8/17 paycheck deduction

## What I verified in the live data

Both debts do have a cleared, linked transaction dated 2026-08-17:

- `Deduction: TSP Loan 1` — amount **+295.57**, `linked_debt_id` = TSP Loan
- `Deduction: TSP Loan 2` — amount **+55.94**, `linked_debt_id` = TSP Loan 2

Their stored `payment_status` is already `cleared` (the auto-pay ran), but the
Payment Schedule and the other screens read the **ledger-derived** state
(ADR-036), and that derivation reports `unpaid`.

## Root cause

Cycle math nets **signed** amounts: a payment counts as `-amount`, because an
ordinary debt payment is written as a negative row (`Debt payment · Aarons`
= -106.30). A deduction-funded payment (ADR-055/068) reuses the *deposit* row
written into the deduction's destination account, which is **positive** — money
into the TSP account. Summing `-(+295.57)` gives a negative contribution, which
clamps to 0, so the cycle reads as having no payments at all.

This affects every deduction-funded bill/debt, not just the two TSP loans
(`Deduction: 401k Loan 1` on 8/27 is the same shape).

## Fix

Both halves of "credit the account, reduce the debt" already happen today and
stay unchanged: the deduction posts a positive deposit into its destination
account (credit), and the auto-pay calls `applyClearedPayment`, which reduced
the TSP balances and set `payment_status = 'cleared'`. The only thing broken is
the *derived* status shown on screen.

In `src/lib/ledger-state.ts`, count a linked transaction that is the payable's
own deduction deposit by its **magnitude** rather than its sign:

- A payable with `funding_deduction_id` set treats linked cleared rows written
  by that deduction as payments of `Math.abs(amount)`.
- Identify those rows narrowly (positive amount whose account is the funding
  deduction's destination account / written by the deduction post), so a
  genuine positive row such as a reversal (`Reversed: GTC payment`) keeps
  offsetting its payment exactly as today.
- Apply the same treatment in the pending/partial branches and in the
  `resolved` lookback window so a deduction-funded item can also read
  `partial` when the posted amount is short.


No data migration is needed: the rows and the stored statuses are already
correct, only the derivation is wrong.

## Checks

- Unit tests in `src/lib/ledger-state.test.ts` for a deduction-funded debt with
  a positive linked deposit → `cleared`, a short deposit → `partial`, and a
  reversal row still cancelling a normal payment.
- Verify in the preview that TSP Loan, TSP Loan 2 and 401k Loan 1 show
  **Cleared** on Payment Schedule, Everything and the debt detail.

## Docs

`docs/SESSION.md` bullet; `docs/DECISIONS.md` appended under **ADR-068**
(sign convention for deduction-funded payments) — no new ADR number.
