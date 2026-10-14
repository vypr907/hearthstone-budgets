# SESSION.md

## Session Notes

- 2026-10-13: Dave ExtraCash — restored "Record advance"/"Add adjustment"
  buttons for linked `debt_type='advance'` debts (narrowed the ADR-102
  2026-09-15 "hidden once linked" gate to non-advance debts), and added a
  new per-advance episode history view replacing the flat Advances list
  (new ADR-111). New `src/lib/debt-episodes.ts` (`computeAdvanceEpisodes`)
  + `src/lib/debt-episodes.test.ts` (13 tests); `src/routes/app.debts.tsx`
  updated (`DebtAdjustments`, new `AdvanceEpisodeCard`). ADR-102 addendum +
  ADR-111 written to docs/DECISIONS.md. `tsc --noEmit` clean, 268/268 tests
  pass.
  - 2026-10-14: Step 0 SQL fix run by user (deleted duplicate untagged
    $15 transfer, ids `99a1fa59-65bc-4a16-b6eb-cf4e41a2074d` and
    `15651294-dc8c-4ce0-b175-58ffea0cf275`) — confirmed gone via the
    read-only MCP. Dave ExtraCash's balance now correctly reads $40.00.
  - Not yet verified in a running browser (sandbox can't reach `npm run
    dev`'s port) — needs a Codespace or real device pass to confirm the
    restored button, updated copy, and new episode cards render/expand
    correctly.
- 2026-10-14: Fixed the ADR-111 episode view's remaining bugs, found live
  on Dave ExtraCash after the first pass shipped — every episode before
  the latest showed "Carried forward" with an inflated number, and no
  repayment ever appeared. Two real bugs: (1) the linked branch only
  summed the Dave ExtraCash account's own transactions, blind to every
  pre-link (before 2026-09-11) advance/repayment logged tagged-but-on-a-
  different-account; (2) episode status only looked one window ahead, so
  a shortfall resolved a window later than its own boundary stayed
  mislabeled forever. Fixed both in `src/lib/debt-episodes.ts`: merged
  content now also pulls in cross-account tagged transactions (deduped
  against already-mirrored pairs, excluding a new `isArrearsOnlyPayment()`
  helper in `src/lib/payments.ts` — found live that a $40 "Arrears
  payment" row, which only moves `arrears_paid_to_date` never principal,
  broke an otherwise-exact reconciliation), and `applyCarryForward` now
  resolves status retroactively instead of one-window-ahead only. Also:
  the two orphaned "Overdraft Fee" adjustments (no mirror) are now
  included in the Fees total; `AdvanceEpisodeCard` shows the real
  contributing transactions, not just adjustment rows; "Record advance"
  gets an optional combined "Fee" field (writes a second
  `advance_fee` adjustment on save, no schema change); and
  `AddTransactionFab.tsx`'s Expense-mode hint is now account-type-aware
  (the old generic hint gave wrong sign advice for a credit account —
  ADR-014 addendum).
  - ADR-111 and ADR-014 addenda written to docs/DECISIONS.md. `tsc
    --noEmit` clean, 270/270 tests pass (2 new in `debt-episodes.test.ts`;
    1 existing test's expectation updated for the retroactive-status fix).
  - Live-data spot check (scratch test against Dave's full real
    cross-account history, read-only MCP) confirms every episode before
    the latest now reads "repaid" and the latest reads "open" at exactly
    $40 — matching the live anchor-based figure exactly.
  - SQL backfill for the two orphaned Overdraft Fee adjustments' missing
    mirror transactions
    (`scripts/migrations/2026-10-14-dave-overdraft-fee-mirrors.sql`) — run
    by the user.
  - Follow-up: the user clarified the $40 still showing "Open" is also
    settled — it was paid 2026-09-25 via "Log arrears payment" instead of
    a regular debt payment, so `useMarkArrearsPaid` (ADR-076) only updated
    `arrears_paid_to_date`, never the linked account. New backfill drafted
    (`scripts/migrations/2026-10-14-dave-arrears-payment-mirror.sql`) adds
    the missing +$40 mirror onto Dave ExtraCash, dated 2026-09-25, leaving
    the original arrears-payment row untouched. No code change — once run,
    the existing (already-shipped) anchor-based override naturally
    recomputes to $0/"Repaid" with no further changes. Verified via a
    scratch test before handing off the SQL. Run by the user 2026-10-14,
    confirmed landed via the read-only MCP — Dave ExtraCash now nets to
    $0 owed; every episode, including the most recent, should show
    "Repaid."
  - Found but out of scope: `debt-history.ts`'s `debtBalanceAsOf` (Year in
    Review, every debt type) has the identical un-excluded-arrears-row
    gap — confirmed live via the "Car" debt's own arrears row. Filed as
    GitHub Issue #79 (root cause was an invalid `GITHUB_TOKEN` env var
    shadowing a valid stored `gh` login — unset it and `gh` worked fine).
  - Not yet verified in a running browser — same sandbox limitation as
    above.
