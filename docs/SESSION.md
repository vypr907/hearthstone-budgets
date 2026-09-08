# SESSION.md

## Session Notes

- Added an optional fee to manual Transfers (Venmo-style instant-transfer
  fee, where more leaves the source account than lands in the destination).
  Reuses ADR-046's bill/debt fee mechanism verbatim instead of a new
  mechanism: a third, unlinked transaction on the from-account, categorized
  "Fees", paired to the transfer via `split_group_id` (never
  `transfer_group_id`, which stays a clean two-row pair). ADR-097. Files:
  `src/lib/payments.ts` (generalized/exported `insertFeeTransaction`,
  `hasFee`, `feeCategoryId`, `deletePairedFees`; fixed a latent bug where
  `feeCategoryId` never set `domain` on a newly created "Fees" category,
  which is NOT NULL live), `src/lib/data-hooks.ts` (`useSaveTransfer`,
  `useDeleteTransferPair`), `src/components/AddTransactionFab.tsx` (Fee
  input field on the Transfer tab), `src/lib/internal-transfers.test.ts`
  (new coverage: the fee row is not miscounted as an internal-transfer leg).
  Verified end-to-end in the dev server against the TEST household
  (ADR-083): write, category, and UI-driven delete-cascade all confirmed via
  the read-only Supabase MCP before/after.
  - Docs: docs/SCHEMA.md corrected `categories.domain` from nullable to
    NOT NULL (live-schema check found the doc was stale) and cross-referenced
    ADR-097 under `transactions.transfer_group_id`.

- Follow-up in the same session (ADR-097 addendum, same date): fixed the
  "Split · 1 categories" cosmetic wart and added the ability to edit a
  transfer's fee after the fact.
  - Root-caused the wart to a general bug, not a transfer-specific one: any
    `split_group_id` shared by exactly one row was misclassified as a real
    split everywhere it was checked. Fixed at the source in
    `groupLedgerRows` (`src/lib/split-groups.ts`) — a size-1 group now
    renders exactly like an ungrouped row — plus two callers in
    `src/routes/app.transactions.tsx` that had the same `length > 0` vs.
    `length > 1` bug (`isCategorySplitGroup`/`isPaycheckDeposit` guards) and
    a related regression it would have caused (Category/Place fields hidden
    on a solo fee row because they were gated on "has a split_group_id" —
    regated on `isPaycheckDeposit` specifically). New tests in
    `src/lib/split-groups.test.ts`.
  - Added a "Fee" field to the transfer's own `TransactionDetail` view
    (visible from either leg): shows the current fee (or "None") and, in
    edit mode, lets the user add, change, or clear it — not just at Add
    Transaction time. New `useSetTransferFee` hook in `src/lib/data-hooks.ts`
    handles insert/update/delete; the fee always attributes to the transfer's
    from-account regardless of which leg is open.
  - Verified end-to-end against the TEST household: seeded a fee-less
    transfer directly, added a fee via the UI (confirmed correct from-account
    attribution even when editing the *other* leg), confirmed the fee row
    now displays as a plain transaction (no more split badge, Category
    editable), then removed the fee via the UI and confirmed only the fee
    row was deleted.
  - Next step: none open.

- Venmo statement reconciliation (Jul 1 – Sep 8 2026), real "Our Household"
  data. Compared 3 Venmo monthly statement CSVs (`planning/*.csv`, gitignored,
  user-supplied) against the "Venmo - Steven" account's 148 logged
  transactions, via a new read-only tool `scripts/reconcile-venmo-csv.mjs`
  (parses the CSVs + a JSON snapshot pulled from the live DB via the
  read-only MCP, ±1 day date tolerance to account for the household's Alaska
  time vs. Venmo's UTC timestamps, subset-sum amount matching).
  - **Key finding, confirmed with the user:** every one of the three
    statements fails to self-balance (Beginning + listed activity ≠ Ending
    Balance — off by $3,943.70 in July, $3,110.53 in August, $352.03 in
    September-to-date) — Venmo's own CSV export omits some incoming activity
    from its itemized list while still reflecting it in the balance. This
    covers most but not all of the "Paycheck: UberEats" entries (daily
    leftover-tip auto-cashouts) that had no CSV match. Per the user: trust
    the app's existing incoming entries as-is; this pass only reconciles
    **outgoing** Venmo activity, where the CSVs are fully itemized and
    trustworthy.
  - Interviewed the user through every real discrepancy batch (not
    guessed): category defaults for ambiguous multi-purpose merchants (Circle
    K, Fred Meyers, Safeway, McPeaks) using the household's own historical
    category distribution per institution as the tie-breaker; per-merchant
    corrections for ~15 specific patterns (JIM.COM, GOOGLE *DAWG, Google
    Pixel/Watcher/Finch/Snapchat, Fred M Fuel, Starbucks/Sunrise, Nature's
    Releaf, split Uber charges by amount, Walmart); destination accounts for
    every Instant Transfer/Standard Transfer/Instant Add Funds (Mastercard
    *0461 → Steph One Checking, Visa *1661 → Classic Checking (USAA),
    Bancorp Bank *4019 → SoFi Checking, Mastercard *0491 → One Checking -
    Steven); linked the missing Concora/Milestone Direct Debit to the
    existing Milestone debt.
  - Caught and fixed a matcher bug mid-session: the initial < 1 cent
    tolerance let an unrelated Fred Meyers ($40.00) + Finch bill fee ($9.99)
    coincidentally sum to within a cent of an Instant Transfer's core amount
    (both on the same date) and falsely "matched" it — tightened to < 0.5
    cent and re-verified before generating any SQL.
  - One near-miss resolved by inspection, not insertion: a $809.99
    "APF*INVEST ALASKA REAL" CSV charge (8/4) is the same event as the
    existing "Bill payment · Rent 1" ($800) + "Fee: Rent 1" ($9.99) app
    entries (8/7) — amount-exact, just a 3-day date discrepancy already in
    the app. Confirmed with the user and excluded from the migration (not a
    real gap, nothing to insert).
  - Result: `scripts/migrations/2026-09-08-venmo-reconcile.sql` (+
    `.verify.sql`), 142 statements (121 plain transactions + 19 ADR-056/097
    transfer+fee groups + 1 Standard Transfer + 1 Instant Add Funds),
    generated programmatically from the interview decisions (not
    hand-transcribed) via a throwaway `planning/gen-venmo-migration.mjs`, and
    dry-run verified by applying the synthetic inserts to a copy of the
    snapshot and re-running the reconciler — zero remaining discrepancies
    besides the deliberately-excluded Rent row.
  - **Institution audit, requested by the user before running anything**:
    pulled the household's full institutions list (rather than the earlier
    narrow name-search) and re-checked every `institution_id` in the
    migration against it. Found and fixed 2 real problems: (1) 5 Google-app
    charges (Pixel Flow, Watcher of Realms, Snapchat, Finch, GigU) had been
    generalized to a "Google Play"-ish catch-all when each already has its
    own dedicated institution in this household's established one-institution-
    per-app pattern — worse, the ID used for that catch-all was actually
    "Google One"'s, not even "Google Play"'s; (2) the Milestone debt payment
    was missing the `institution_id` that ADR-065 says a linked bill/debt
    payment should always carry from its own payable. Both fixed and
    re-verified with the same dry-run method.
  - 6 merchants had no existing institution at all — interviewed the user
    per row rather than guessing: 4 got new institutions created in the
    migration (`DAWG Self Discipline`, `The Sheet Code`,
    `FTWW Express Shoppette` for WAI EXPRESS, `Gyro and More Falafel` for
    JIM.COM* MURAD AHMMAD — all `institution_type = 'other'`, matching every
    comparable merchant/app institution already in the household), 1 stays
    institution-less by design (the $332.83 non-Eats "Uber" ride charge —
    not confirmed to be UberEats specifically), 1 got tagged to the existing
    UberEats institution (the $59.75 dining Uber charge, per the user).
  - User ran the migration in the Supabase SQL Editor. Re-verified all 5
    verify-script checks plus a full re-run of the reconciler against a
    fresh live snapshot — 161 rows added exactly as expected, the $1,254.45
    outlier and Milestone payment landed correctly, all 4 institutions
    created exactly once, and only the deliberately-excluded Rent row
    remained unmatched. Committed and pushed (`f5d51fc`).

- **Bug found post-commit: 13 duplicate inserts, reported by the user**
  (North Pole Alehouse "$9 drinks with MK" already existed, migration added
  a second "SQ *NORTH POLE ALEHOUS" row for it). Root cause: the migration's
  matching used a ±1 day date tolerance to decide "already logged," but real
  Venmo card purchases can clear 2-5 days after the date the household
  entered manually — so 13 CSV events that were genuinely already in the
  ledger (just dated a few days differently than Venmo's own statement)
  looked "missing" and got re-inserted.
  - Found and fixed the *right* set through several failed approaches, worth
    recording so the mistake isn't repeated: (1) naive amount+institution
    proximity search over-triggered on repeat merchants (Pixel Flow's
    frequent $2.10 charges) — too noisy; (2) widening the matcher's date
    window naively let unrelated same-amount rows "steal" matches meant for
    a different merchant (a random -$20 purchase almost got confused for the
    unique Milestone debt payment); (3) bucket-counting by amount alone
    conflated coincidentally-equal amounts across unrelated merchants; (4) a
    "prefer oldest row" tie-break *sounded* right but picked a wrong pairing
    for repeat merchants (McDonald's $6.70) because it ignored date
    proximity entirely. The fix that finally held up: bucket by
    (institution_id, amount), then within each bucket let pre-existing rows
    claim their closest-date real CSV event *before* migration rows are
    considered — cross-validated by simulating the removal and re-running
    the audit twice (zero duplicates, zero new gaps, stable across ±5/±15/
    ±30 day windows).
  - Also caught a real transcription typo while validating: the audit
    script had the wrong id for the "Little Owl Cafe" institution (copy
    error, one hex group wrong) — harmless here (no migration row existed
    for that merchant to misclassify) but was quietly causing 2 false
    "unresolved" rows in the sanity check. Fixed in both the throwaway audit
    script and the permanent tool.
  - Result: `scripts/migrations/2026-09-08-venmo-reconcile-dedupe.sql` (+
    `.verify.sql`) — 13 deletes, one per confirmed duplicate, each with a
    comment identifying its pre-existing counterpart. Not yet run.
  - **Permanently fixed the reusable tool** (`scripts/reconcile-venmo-csv.mjs`,
    meant for future monthly reconciliation passes) so this can't recur the
    same way: widened its window from ±1 to ±5 days, added an
    institution_id constraint for purchase-type CSV rows (extensible
    `MERCHANT_INSTITUTIONS` table in the script — add new merchants there as
    they show up in future statements), and fixed the tie-break to prefer
    closest date rather than array order or creation time. Documented a
    known residual limitation in the tool's own docblock: very frequent
    same-amount repeat charges in one statement can still occasionally
    produce an over-cautious false "missing" flag (never a false match) due
    to single-pass chronological processing rather than a fully optimal
    bipartite match — call out for a quick manual glance, not auto-trusted.
  - Next step: user reviews and runs the dedupe migration + verify script;
    re-confirm via MCP afterward, same as the original migration.
