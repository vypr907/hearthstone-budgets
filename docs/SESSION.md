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
- 2026-10-14: Fixed a third Dave ExtraCash bug — taking a real $100
  advance + $10 fee (the new combined entry) pushed `minimum_payment` to
  $140 instead of $110, and the debt showed a false "1 cycle · $80 past
  due" even though the new advance isn't due until 2026-10-22. Root cause
  (ADR-102 addendum): `apply_debt_advance`/`apply_debt_adjustment` always
  add onto the STORED `remaining_balance` column — correct for an
  unlinked debt, but for a linked one that column is only ever corrected
  on the read path (`effectiveDebtBalance`), never the write path, so it
  had drifted to a stale $30 and the new advance compounded onto it
  (30+100+10=140). `minimum_payment`/`next_due_date` have no derived
  override at all, so the mistake reached the UI directly, and the stale
  `next_due_date` tripped `arrears.ts`'s cycle walk into a false overdue
  reading.
  - Fix: both RPCs gain a new optional `p_current_balance_override`
    param (backward compatible, unlinked debts unaffected);
    `useCreateAdvance`/`useAddDebtAdjustment` (`src/lib/data-hooks.ts`)
    now compute the real current balance via `effectiveDebtBalance()`
    for a linked debt and pass it in. `apply_debt_advance`'s due-date
    fill widened from "once ever, only if blank" to also reset when the
    prior balance was ~0 (also fixes the same latent gap for a paid-off
    *unlinked* advance debt taking a new draw).
  - Migration: `scripts/migrations/2026-10-14-linked-advance-balance-override.sql`
    (RPC changes + one-time fix of Dave's drifted row to $110/$110/
    2026-10-22) — run by the user 2026-10-15.
  - Follow-up bug found running it: `create or replace function` only
    replaces a function with the EXACT SAME parameter list — adding a new
    trailing parameter made Postgres create a second overload instead of
    replacing the original, so the old 3-arg (still-buggy) functions
    stayed live alongside the new 4-arg ones. Any caller passing only 3
    named args would've silently resolved to the stale version, undoing
    the fix for that call shape. Fixed with
    `scripts/migrations/2026-10-15-drop-stale-debt-rpc-overloads.sql`
    (drops the old 3-arg signatures) — run by the user, confirmed via the
    read-only MCP that exactly one (4-arg) overload of each function now
    exists.
  - `tsc --noEmit` clean, 270/270 tests pass (no new pure logic to test —
    both hooks just call the already-tested `effectiveDebtBalance()`).
  - Scoped out: `useLogDebtPayment`'s historical/out-of-cycle branch
    (`src/lib/payments.ts`) has the same RPC exposure but fixing it the
    same way would need importing from `data-hooks.ts`, which already
    imports from `payments.ts` — circular-import risk. Flagged, not fixed.
  - Not yet verified in a running browser — same sandbox limitation.
- 2026-10-15: Fixed two more ADR-111 episode-view bugs, found live on
  EarnIn (unlinked advance debt) — user reported "a lot of carried
  forward on the advances, instead of the payments being made going
  towards the correct advance." Both bugs are in shared logic, so they
  affect every unlinked advance debt, not just EarnIn:
  - `useCreateAdvance` inserts the disbursement transaction a fraction of
    a second before its `debt_adjustments` row, so a debt's very first
    advance's own disbursement could sort as if it predated the marker
    itself, misclassifying it as a "pre-tracking orphan" and double-
    counting the draw — a phantom amount that never gets repaid, which
    permanently inflated every later episode's carried balance so
    nothing ever resolved. Fixed by matching each marker to its own
    disbursement by amount+date (same pattern the linked branch already
    used), not creation-order, before falling back to orphan detection.
  - `applyCarryForward`'s retroactive-resolution fix (from 2026-10-14)
    only backfilled "repaid" onto earlier pending episodes when an
    *intermediate* window resolved to zero — if the chain doesn't
    actually clear until the very last window's own payment, the earlier
    ones stayed stuck at "carried forward" forever even though the debt
    was genuinely fully settled. Fixed by running the same backfill
    check on every window, including the last.
  - Both confirmed via a scratch test against EarnIn's real history
    (read-only MCP): every episode now reads "repaid" except the
    still-open one, with the reconstructed total landing on exactly $0.
  - 2 new regression tests in `debt-episodes.test.ts`. ADR-111 addendum
    written to docs/DECISIONS.md. `tsc --noEmit` clean, 272/272 tests
    pass.
  - **Resolved**: the reconstructed $0 did NOT match EarnIn's stored
    `remaining_balance` ($200) — unlike Dave, EarnIn is unlinked, so
    there's no derived-balance override and whatever the stored column
    says is what the app displays. Hand-simulating the real
    `apply_cleared_debt_payment` RPC call history against the live data
    couldn't reproduce $200 either (it also gives $0), so the exact
    mechanism of the drift was never pinned down. User confirmed live:
    EarnIn is in fact paid off. Drafted
    `scripts/migrations/2026-10-15-earnin-balance-reconcile.sql`
    (`remaining_balance`/`minimum_payment`/`cycle_paid_to_date` → 0,
    `payment_status` → `'unpaid'`, matching what
    `apply_cleared_debt_payment` itself sets on a resolved biweekly
    cycle — not fixed to `'cleared'`, that's an existing convention for
    advance debts, not introduced here). `next_due_date` left untouched:
    `computeArrears()` short-circuits to empty whenever
    `remaining_balance <= 0`, so a stale due date can't trip a false
    "past due" once this lands. Not yet run by the user.
  - Not yet verified in a running browser — same sandbox limitation.
