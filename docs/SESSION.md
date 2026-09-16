# SESSION.md

## Session Notes
- **Cleo advance debt: diagnosed + fixed corrupted remaining_balance
  (should be $70, was $55).** User reported two $55 advances taken but
  balance only showing $55. Verified live via the read-only MCP:
  `debt_adjustments` (immune to the bug) confirms two real, distinct $55
  advances (9/4, 9/5) plus an earlier $40 advance/repayment cycle already
  netting to $0 by 8/14. Root cause #1: the two $55 advances were written
  16 seconds apart on 9/6 — before this session's ADR-101 atomic-RPC fix
  existed (applied 9/11) — so the second write overwrote the first instead
  of adding (same bug class as Dave ExtraCash/EarnIn, never individually
  repaired for Cleo until now). Root cause #2: a $17.98 "Express Fee" was
  entered as both a balance-increasing Adjustment and a balance-decreasing
  payment transaction — user confirmed both are real and should cancel out,
  and should properly be two separate $8.99 fees (one per advance),
  matching the debt's own existing non-balance-affecting `Fee:` convention
  from an earlier 8/14 $6.99 fee. Correct balance computed two independent
  ways (debt_adjustments-minus-repayments, and a write-order balance walk):
  $70.00. Wrote `scripts/migrations/2026-09-15-cleo-advance-fix.sql` (+
  `.verify.sql`) — deletes the erroneous adjustment + transaction, inserts
  two proper $8.99 `Fee:` transactions (9/4, 9/5), sets
  `remaining_balance`/`minimum_payment` to 70.00. `cycle_paid_to_date`/
  `payment_status`/`next_due_date` (2026-09-10, user-confirmed correct)
  untouched. No schema change, no ADR (data-only). Not yet applied — user
  runs it manually.
- **Cleo fix corrected — the $70.00 draft above was wrong.** User caught it:
  a second -$40 "Debt payment · Cleo" transaction (dated 7/17, backfilled
  9/10) was wrongly subtracted — it predates any advance on record for this
  debt (created 8/13, first recorded advance 8/8), so it was repaying an
  advance never entered. User confirmed: a real $40 Cleo advance on
  2026-07-09 was simply missing. Also corrected: the two replacement $8.99
  fee transactions are dated 9/13 (when actually paid, via Venmo), not
  9/4/9/5 (the advance dates) — confirmed the 9a1a0f9a… account used in the
  existing fee precedent is indeed "Venmo - Steven". Rewrote
  `scripts/migrations/2026-09-15-cleo-advance-fix.sql` (+ `.verify.sql`):
  adds the missing 7/9 $40 advance (adjustment + transaction), removes the
  erroneous $17.98 double-entry, adds two $8.99 `Fee:` transactions dated
  9/13, sets `remaining_balance`/`minimum_payment` to **110.00** (advances
  40+40+55+55=190 minus real repayments 40+40=80). Verified the arithmetic
  independently. Not yet applied — user runs it manually.
- **ADR-102 addendum: credit accounts linked to their credit-card debts,
  derived balance.** Researched via 3 parallel Explore agents + 1 Plan
  agent (the latter died mid-run to a connection error, resumed from its
  own transcript), then interviewed the user through 4 rounds of open
  design questions before implementing. User's Milestone/CreditOne/Mission
  Lane credit accounts were almost entirely inert (0-2 transactions each)
  while their matching debts tracked "owed" purely via Advance/Adjustment/
  Payment — no "purchase" concept exists anywhere in the app, so the two
  numbers could freely drift (and already had). Decision: **the account
  becomes the source of truth** — a purchase is just a normal expense
  transaction on the account (already fully supported, zero new UI); the
  debt's `remaining_balance` is *derived* from the account, never
  independently written (same "derived, never stored" shape as ADR-027/
  ADR-036).
  - **Critical scope discovery mid-plan**: last session's account-mirroring
    (ADR-102) only covered the secondary "Log a payment" dialog, not the
    everyday tap-to-pay Submit/Clear flow actually used day-to-day — fixed
    as a required prerequisite (Part 0), not deferred.
  - `src/lib/payments.ts` — `useMarkSubmitted`/`useMarkCleared` now mirror
    onto a linked debt's account (matching the existing advance/adjustment
    mirror pattern), with the shared `transfer_group_id` set on **both**
    rows this time (not just the mirror), enabling real cleanup. New
    `transferGroupIdsFor`/`deleteMirrorTransaction`/`findMirrorTransaction`
    helpers. `useMarkUnpaid`, `useResetCycle`, `useReversePayment`,
    `useEditLinkedTransaction` all now find and delete/reverse/sync a
    payment's mirror leg — **closes Issue #65** for every payment path (it
    only ever protected `useLogDebtPayment`'s own mirrors before, and even
    those had no working cleanup path until now).
  - `src/lib/balances.ts` — new `effectiveDebtBalance()`: derives a linked
    debt's balance from its account, falls back to the stored column
    unchanged for every unlinked debt (the vast majority).
  - `src/lib/data-hooks.ts` — new `useEffectiveDebts()`, display-path only.
    Swapped into 7 pure-display routes (`app.index`, `app.institutions`,
    `app.payment-schedule`, `app.snapshot`, `app.debt-strategy`,
    `app.paycheck`, `app.pending`). `app.debts.tsx` and `app.everything.tsx`
    (both also trigger mutations via `usePayFlow`/`PayActions`) keep the
    **raw** `useDebts()` feeding every `toPayable()`/mutation call — several
    mutations (Issue #67) still compute `next = remaining_balance ± amount`
    client-side and write it back absolute, so a derived number there would
    corrupt the now-inert stored column. Those two screens compute a small
    local display-only value instead everywhere they show a dollar figure
    (`DebtsPage`'s `effectiveBalanceById` map; `DebtDetailDialog`'s own
    internal `effectiveDebtBalance` call), leaving the `Debt` object itself
    untouched.
  - `DebtDialog`: "Remaining balance" goes read-only (shows the derived
    value) and is omitted from the save payload once linked — same
    treatment `isAdvance` already got. `minimum_payment` stays independently
    editable (a real credit card's minimum isn't the full balance;
    `advanceMinimumPaymentPatch` was already, and remains, advance-only).
    Adjustments/Advances "Add" actions hidden once linked (would otherwise
    be a silent no-op).
  - `src/lib/debt-history.ts` (Year in Review) — `debtBalanceAsOf` delegates
    to `net-worth.ts`'s `balanceAsOf` for a linked debt at any date; accepted
    tradeoff, the trend reads flat before the account had real activity.
  - `src/components/StrandedDebtRepair.tsx` — excludes linked debts (its
    ADR-037 heuristic assumes `remaining_balance` is authoritative).
  - `docs/DECISIONS.md` — full ADR-102 addendum written.
  - `scripts/migrations/2026-09-15-credit-debt-account-links.sql` (+
    `.verify.sql`): links Milestone/CreditOne/Mission Lane to their matching
    accounts, anchors each account's `starting_balance` so the first derived
    read matches what's already trusted (no jump — not a statement-accurate
    fix, the user is reconciling those separately). GTC (debt-only, no
    matching account) left untouched per the user. **Flagged, not resolved**:
    Mission Lane's account already carries 2 real "Credit Protect Fee"
    transactions with no matching `debt_adjustments` row; the user wasn't
    sure whether its current $1,318.01 already includes them — migration
    assumes it does not (additive), per the user's own chosen fallback;
    the SQL comments flag exactly which number to change if that's wrong.
    Not yet applied — user runs it manually.
  - `tsc --noEmit` clean, 214/214 tests pass throughout (checked after every
    part, not just at the end). **Could not verify end-to-end**: no
    Playwright/TEST-household pass this session — this machine has no
    Codespace access, no `.env.test`, and no Playwright browser installed
    locally (confirmed, not assumed). Reviewed every changed file by hand
    instead, including re-reading the exact pre-existing bidirectional
    `transfer_group_id` pattern `useCreateAdvance` already used as the
    model for the new Submit/Clear mirroring. Recommend a Codespace
    Playwright pass against the TEST household (link a throwaway debt +
    account, log a purchase, submit→clear a payment, reverse it, edit it)
    before fully trusting this against the 3 real linked debts.
