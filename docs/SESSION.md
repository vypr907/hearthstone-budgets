# SESSION.md

## Session Notes

- **ADR-114: per-line place for split / Cash Back entries.** User hit a real
  gap entering an ATM withdrawal: $3 ATM-operator fee and $2.50 Cash App
  network fee need two different places, but a split/Cash Back entry only
  had one shared place for the whole thing (same scenario manually patched
  via raw SQL in the 2026-11-03 Venmo migration).
  - `SplitRow` (`src/components/SplitLinesEditor.tsx`) gains
    `institutionId: string | null`; new local `CompactPlacePicker` wraps
    `PlacePicker` in a `Popover` (mirrors `TagPicker`'s `compact` mode —
    `PlacePicker` itself is block-level, never built for an inline row).
    Row layout changed from one flex line to a bordered two-line card
    (category/amount/delete, then tags/place) to fit the extra picker on
    phone width.
  - Both write paths resolve `institution_id` as `line.institutionId ??
    <shared institutionId> ?? null` — `insertCashBackPurchaseRows`
    (`src/lib/payments.ts`) and `useSaveSplitTransaction`
    (`src/lib/data-hooks.ts`, `SplitLine` type). Same fallback convention
    `submitTransfer`'s fee leg already used.
  - `AddTransactionFab.tsx`'s split branch and Cash Back submit handlers
    now pass `r.institutionId` per line. `app.transactions.tsx`'s
    `SplitTransactionDetail` (plain-split edit dialog) seeds + saves
    per-line institution the same way it already does tags, and its
    read-only summary now shows each line's place.
  - Cash Back purchase-line groups don't go through the split edit dialog
    at all (`assertCategorySplitGroup` already excludes them from it) — no
    edit-path work needed there; each row is already editable individually
    via the normal single-transaction edit dialog, same as before.
  - No schema change — `transactions.institution_id` already existed per
    row; this was a UI + write-path gap only.
  - Files touched: `src/components/SplitLinesEditor.tsx`,
    `src/lib/payments.ts`, `src/lib/data-hooks.ts`,
    `src/components/AddTransactionFab.tsx`, `src/routes/app.transactions.tsx`,
    `docs/DECISIONS.md` (ADR-114).
  - `tsc --noEmit` clean, 283/283 tests pass (additive field + preserved
    fallback, no new pure-logic fixtures needed).
  - Known issues: not yet checked in a running browser.
  - Next step: browser check — recreate the motivating ATM example (cash +
    2 fee lines, 2 different places) and confirm both lines save with
    distinct `institution_id`, and a blank line correctly falls back to the
    entry's shared place.

- **Issue #82 / ADR-111 addendum: concurrent advances for `debt_type='advance'` debts.**
  Fixed the root cause behind the Cleo episode-card misattribution the user
  flagged (fees/repayments for earlier draws all showing up on the most
  recent draw). `computeAdvanceEpisodes` (`src/lib/debt-episodes.ts`) used
  to bucket events into a fixed date window per draw, with the LAST
  marker's window open-ended — swallowing everything dated after it. That
  rested on ADR-111's explicit "one open advance at a time" assumption,
  now confirmed wrong: Cleo lets the household take several concurrent
  draws before repaying any of them.
  - Replaced the window+`applyCarryForward` model with `runFifoAllocation`
    — each draw gets its own independent running balance; repayments
    always FIFO-allocate to the oldest still-open draw (cascading into the
    next if they exceed it — an explicit allocation convention, not a
    recovered fact, since nothing in the data links a repayment to a
    specific draw); fees attribute via a best-effort parse of the existing
    `"(M/D advance)"` description convention (`resolveFeeMarkerHint`),
    falling back to the same FIFO-oldest-open rule, and can reopen an
    already-resolved draw. `"carried_forward"` status retired (confirmed
    with the user) — every episode now reads `"open"`/`"repaid"`. `net`
    changed meaning from the whole debt's cumulative balance to each
    draw's own remaining balance; `endDate` from "next marker's date" to
    "this draw's own resolution date." A real schema-backed link (new FK
    column + UI picker) was considered and deliberately deferred — flagged
    in the ADR, not built this session.
  - `feesTotal`'s ADR-084 exclusion of ledger-only `"Fee: "` transactions
    is unchanged — fixing attribution didn't require redefining what
    counts toward that stat; confirmed with the user and flagged in the
    ADR as a separate decision if they want it revisited later.
  - `LogDebtPaymentDialog.tsx`'s advance-fee warning (only checks the
    latest episode) has a real, now more-relevant gap — flagged as a known
    limitation in the ADR, not fixed this session (would need the
    deferred schema/UI work).
  - Files touched: `src/lib/debt-episodes.ts` (full rewrite of the
    partitioning engine, same public `computeAdvanceEpisodes` signature
    and `AdvanceEpisode` field names), `src/lib/debt-episodes.test.ts` (5
    existing tests updated to the new per-draw semantics, 6 new
    concurrent-draw fixtures added), `docs/DECISIONS.md` (ADR-111
    addendum).
  - `tsc --noEmit` clean, 283/283 tests pass (277 carried over from
    earlier this session's work + 6 new concurrent-draw fixtures; 5
    existing `debt-episodes.test.ts` tests updated in place to the new
    per-draw semantics, none deleted).
  - Verified by hand against the real live Cleo data (read-only MCP): the
    3 concurrent October draws now correctly show 10/15 and 10/16 as
    independently `repaid` (their own $55 advance, $8.99 fee, $55 repaid
    each) and 10/20 as `open` ($55 advance, $8.99 fee, $0 repaid, matching
    reality — its own repayment lands 11/3, after this session's
    reconciled statement window). Sum of all 7 episodes' `net` = $55.00,
    matching the live `remaining_balance` exactly.
  - Next step: browser check — open Cleo's debt detail and confirm the
    episode cards render correctly (two-fields-changed-meaning risk noted
    in the ADR is invisible to `tsc`, needs eyes-on confirmation).

- **ADR-113: Personal debts (institution_type='person') + "paid by someone else".**
  Built so a friend covering part of a car-repair bill, or paying the GVEA
  electric bill directly to get it reconnected, can be tracked as a real
  debt instead of falling outside the app's model.
  - `institution_type` gains `'person'` — migration run by the user and
    verified live via the read-only MCP (`institutions_institution_type_check`
    now lists all 23 values including `'person'`);
    `InstitutionDialog.tsx`'s `INSTITUTION_TYPES` and `visual-meta.ts`'s icon
    map updated to match.
  - New `isCoveredPaymentDisbursement`/`isDebtDisbursement` predicates
    (`src/lib/payments.ts`), swapped in for every `isAdvanceDisbursement`
    cycle/history-exclusion check (`ledger-state.ts`, `debt-history.ts`,
    `debt-episodes.ts`, `app.debts.tsx`, `app.debt-strategy.tsx`).
  - New `useLogPaymentCoveredByOther` hook (`src/lib/data-hooks.ts`), wired
    into a new "Someone else paid this" toggle in both
    `LogBillPaymentDialog.tsx` and `LogDebtPaymentDialog.tsx`.
  - `DebtDialog` (`app.debts.tsx`) gained an `onSaved` callback;
    `useUpsertDebt` now returns the saved row (previously discarded) —
    groundwork for a future inline quick-create, not yet wired up (v1 ships
    with the "Paid by" picker listing only existing person-debts).
  - Files touched: `src/lib/payments.ts`, `src/lib/payments.test.ts`,
    `src/lib/data-hooks.ts`, `src/lib/ledger-state.ts`,
    `src/lib/debt-history.ts`, `src/lib/debt-episodes.ts`,
    `src/routes/app.debts.tsx`, `src/routes/app.debt-strategy.tsx`,
    `src/components/InstitutionDialog.tsx`, `src/lib/visual-meta.ts`,
    `src/components/LogBillPaymentDialog.tsx`,
    `src/components/LogDebtPaymentDialog.tsx`,
    `scripts/migrations/2026-10-23-institution-type-person.sql` (+ verify).
  - `tsc --noEmit` clean, 277/277 tests pass (3 new).
  - Known issues: migration not yet run live; not yet checked in a running
    browser (dev server/Codespace needed per CLAUDE.md environment note).
  - Next step: end-to-end browser check still outstanding (create a person
    debt, log a bill payment with the toggle on, confirm the bill clears,
    the real account balance is unchanged, and the person-debt's balance
    grew).

- **Venmo catch-up: September + October statement reconciliation.** User had
  fallen behind logging Venmo activity; dropped both months' statement CSVs
  in `planning/`. Reused the existing `scripts/reconcile-venmo-csv.mjs`
  pipeline from the 2026-09-08 pass rather than building anything new.
  - Fixed two bugs in the reusable tool itself: `loadCsvRows()` was reading
    *every* `.csv` in `planning/` and would crash on the USAA/OnePay exports
    also sitting there (now filtered to `VenmoStatement*.csv`); extended the
    static `MERCHANT_INSTITUTIONS` map with institutions that already
    existed live but weren't in the map yet (Sally Beauty, Claude, Cleo,
    Cash App, Flex, Peacock, Ulta, Wendy's, Speedway, Barnes & Noble, Bamboo
    Panda, DoorDash).
  - Pulled a fresh 437-row snapshot of the "Venmo - Steven" account via the
    read-only MCP, ran the reconciler, found 144 missing rows across both
    statements — a long interview with the user resolved every merchant/
    transfer/edge case (10 new institutions, Cash App's real 3-account setup,
    the Rent-via-Flex second-half-of-October payments, a Cleo advance/repay
    sequence whose 2 of 3 draws weren't even in the CSV export at all —
    confirmed against the user's own Venmo app history — the usual-suspect
    ATM cash-out split convention for Nature's Releaf (9x) and a new PAI ATM
    withdrawal, and a from-scratch "Venmo account repayment" type explained
    as a reversed UberEats instant-cashout).
  - Generated `scripts/migrations/2026-11-03-venmo-reconcile-sep-oct.sql` (+
    verify) programmatically from the categorized row list rather than
    hand-transcribing 150+ rows — caught and fixed one real bug this way
    (PAI ATM was being inserted twice: once as a flat row via the generic
    new-institution bucket, once via its dedicated 3-line cash+fee split)
    before it ever reached a SQL file.
  - Explicitly out of scope, flagged in the migration header: 5 duplicate
    $100 Instacash/MoneyLion "Instant Add Funds" rows (already recorded
    elsewhere, skipping to avoid double-counting that debt) and one genuine
    $0.00 Uber row (cause unknown, no economic effect). The Rent (via Flex)
    bill's own cycle stays behind even after these payments land — a bigger
    catch-up than this Venmo pass covers.
  - Files touched: `scripts/reconcile-venmo-csv.mjs`,
    `scripts/migrations/2026-11-03-venmo-reconcile-sep-oct.sql` (+ verify).
  - Migration run by the user; verified live via the read-only MCP — Venmo
    account 437 -> 606 transactions (exact expected delta), all 10 new
    institutions present, Cleo's full ledger interleaves correctly, Rent
    (via Flex) payments landed.
  - **Follow-up bug found post-run** (user caught it in the Debts screen):
    the migration also wrote 2 `debt_adjustments` rows
    (`adjustment_type='repayment'`) for Cleo's two new repayments — not a
    real convention anywhere else in this app (repayments are tracked only
    via the linked `transactions` row). Effect: each $55 repayment was
    double-counted in the advance-episode view, and both rows wrongly
    appeared in the Debts screen's Adjustments list. Fixed via
    `scripts/migrations/2026-11-03-cleo-repayment-adjustment-fix.sql` (+
    verify) — deletes just the 2 bad rows; `remaining_balance`/
    `minimum_payment` ($55.00) were already correct and untouched by this.
    Run by the user, verified live — both rows gone, only the 7 real
    `'advance'` markers remain.
  - Separately, **real app limitation surfaced, not fixed**: Cleo took 3
    concurrent advances before repaying any of them, which
    `computeAdvanceEpisodes` (`src/lib/debt-episodes.ts`) can't represent —
    it assumes advances are always sequential (one open draw at a time), so
    the last marker's open-ended window swallows every fee/repayment dated
    after it, all attributed to the 10/20 draw instead of split across the
    3. Filed as
    [Issue #82](https://github.com/vypr907/hearthstone-budgets/issues/82)
    for a future scoping decision (support concurrent advances for real,
    detect-and-warn, or document as a known limitation) — no code changed.
    User provided a screenshot (`planning/SCR-20261103-htjk.png`) of the 9/4–
    10/15 episodes showing the exact same window-bucketing symptom on data
    that predates this session, confirming it's pre-existing behavior, not
    something this session's migration introduced.
  - **Second follow-up bug found post-run**: Cleo's Debts-screen card showed
    "$147.02 past due." Traced to `next_due_date` being stuck at 2026-09-24
    since before this session — the original reconcile migration updated
    `remaining_balance`/`minimum_payment` but never `next_due_date`/
    `cycle_paid_to_date`. `computeArrears` (`src/lib/arrears.ts`) walks every
    biweekly interval between `next_due_date` and today, multiplying each by
    the *current* `minimum_payment` — harmless while that was $0.00, but
    once set to $55.00 the same stale date suddenly counted 3 fictional
    missed cycles (3 × $55 = $165) minus the pre-existing
    `arrears_paid_to_date` (17.98) = exactly $147.02. Fixed via
    `scripts/migrations/2026-11-03-cleo-next-due-date-fix.sql` (+ verify) —
    moves `next_due_date` to 2026-11-03 (confirmed with the user: 14 days
    after the still-open 10/20 draw) and resets `cycle_paid_to_date` to 0.
    Doesn't touch `remaining_balance`/`minimum_payment`/`arrears_paid_to_date`.
  - Next step: user runs `2026-11-03-cleo-next-due-date-fix.sql` in the
    Supabase SQL Editor, then re-pull the Venmo snapshot and re-run
    `scripts/reconcile-venmo-csv.mjs` to confirm MISSING drops to the
    expected 6 (5 skipped Instacash + 1 skipped $0 Uber).
