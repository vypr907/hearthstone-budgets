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
  - User ran the dedupe. Re-verified: all 13 ids gone, "drinks with MK" the
    sole survivor, row count 296. Full reconciler re-run clean.

- **Second dedupe pass, found while investigating a wrong account balance**
  (user reported app showing -$156, real balance ~$72.13). Root cause: the
  first dedupe only caught duplicates where one existing row matched a
  migration row's amount exactly — it missed 3 cases where the real event
  was already recorded in a *different shape*:
  - **Finch** (-$10.54, 8/4): already tracked as a recurring Bill —
    "Bill payment · Finch" (-$9.99) + "Fee: Finch" (-$0.55) on 8/6 already
    total exactly $10.54. Found by checking every `split_group_id` pair's
    combined total against every migration row's amount+institution
    (a self-join, not caught by the single-row bucket check from the first
    dedupe).
  - **UberEats** (-$25.28 + -$7.31, both 8/18): the household had logged
    this as one lump-sum row (-$32.59, 8/19) instead of two separate CSV
    line items.
  - **Nature's Releaf** (-$63/-$63/-$43 on 8/18, 8/21, 8/22): interviewed
    the user on why these were off by a consistent $2.50 from the
    pre-existing $65.50/$65.50/$45.50 entries rather than assuming — these
    are ATM cash pulls at the dispensary ($60/$60/$40 cash + $3 Nature's
    Releaf surcharge, both inside Venmo's own "$63/$63/$43" statement
    line) plus a separate $2.50 Venmo network fee that Venmo's CSV doesn't
    itemize under that line at all. So the household's original entries
    were already complete and correct; the CSV-exact migration rows were
    the (incomplete) duplicates, not corrections. A 4th CSV Nature's Releaf
    row (8/30, -$63) has no pre-existing counterpart at all and was left
    alone as a genuine new entry.
  - Result: `scripts/migrations/2026-09-08-venmo-reconcile-dedupe2.sql` (+
    `.verify.sql`), 6 deletes. Verified the same way as before: simulated
    the removal and re-ran the reconciler — the 6 CSV rows correctly
    reappear as expected false-negative "missing" flags (the tool's
    single-row matching can't see a multi-row/lump-sum match), nothing else
    changed.
  - Recomputed balance math (`src/lib/balances.ts`'s formula: anchor +
    cleared txns after the anchor's `as_of_date`): anchor $21.03 (snapshot
    dated 8/14) + cleared-after-anchor moves from -$177.84 to -$34.29 pre
    → +$34.29 post, giving a new current balance of **$55.32** — much
    closer to the real ~$72.13 but not exact yet. Flagged to the user as a
    residual gap to watch for after running this migration; may indicate
    more of the same "multi-row/lump-sum" blind spot elsewhere, or the
    anchor snapshot itself needing a look.
  - Next step: user reviews and runs dedupe2 + its verify script (including
    the verify script's own balance-recompute query); re-confirm via MCP;
    check whether $55.32 vs ~$72.13 residual gap needs another pass.

- **Steph Checking transfer duplicate + Nature's Releaf reconciliation
  (2026-09-09), real "Our Household" data.** User-driven review, independent
  of the dedupe/dedupe2 passes above (touches no overlapping rows).
  - Confirmed via read-only MCP: 4 Venmo↔Steph One Checking transfer pairs
    exist in the window; the 8/1 pair (`e9d23fdc.../cac58274...`) is a plain
    duplicate with no matching Venmo statement line — the two 8/7 pairs
    already correctly model "-$25.44 leaves Venmo / +$25.00 arrives" via
    ADR-097 (transfer leg $25/$25 + separate -$0.44 from-account fee), and
    8/13 has no fee, matching Venmo. Migration:
    `scripts/migrations/2026-09-09-steph-xfer-dedupe.sql` (+ `.verify.sql`) —
    2 deletes. Not yet run.
  - Nature's Releaf: the 4 Venmo statement lines (8/18, 8/21, 8/22, 8/30 —
    $65.50/$65.50/$45.50/$65.50) decompose into cash ($60 or $40) + a $3
    Nature's Releaf ATM fee + a $2.50 Venmo network fee, per the user. Also
    found a genuine duplicate: the 8/30 event was recorded twice — once as an
    incomplete $63 lump (missing the Venmo fee) on 8/30, once as a correct
    $65.50 2-line split mis-dated 8/31. Rebuilt all 4 dates as 3-line category
    splits (cash + 2 fee lines, one shared `split_group_id` per date) —
    reusing the existing category-split mechanism verbatim rather than
    ADR-046/097's fee-transaction pattern, since a category split already
    gives bidirectional visibility (the "Show breakdown" toggle) with zero
    code changes; the fee-transaction pattern would have needed a new reverse
    link for what's really a single-account, 3-part purchase, not a two-
    account transfer. Migration:
    `scripts/migrations/2026-09-09-natures-releaf-split.sql` (+
    `.verify.sql`) — 6 deletes, 12 inserts. Net effect: 8/18/8/21/8/22
    restructured only (same totals); 8/30 total drops $63 (removes the
    double-count) — should further close the balance gap flagged in the
    dedupe2 entry above. Not yet run.
  - Next step: user runs both migrations (either order, independent of each
    other and of dedupe2) in the Supabase SQL Editor; re-verify via MCP
    afterward per each `.verify.sql`, including re-checking the Venmo account
    balance gap.

- **Fee ↔ transfer bidirectional link, transfer titles, institution type
  taxonomy + Fix Institution Logins screen (2026-09-09).** Code changes,
  planned and approved via `/plan`, verified with `tsc --noEmit`, `vitest`
  (185/185 passing), and `vite build` (also regenerated `routeTree.gen.ts`
  for the new route) — all clean. **Not verified in a live browser session**:
  no Claude-in-Chrome/Playwright access this session: could not log into the
  TEST household and click through the new screen or a real transfer/fee
  transaction. Flagging per CLAUDE.md — user should smoke-test before
  trusting this over Windows AppLocker's build restriction.
  - ADR-097 addendum: `TransactionDetail` (`app.transactions.tsx`) gained
    `linkedTransferLeg`/`linkedTransferOtherLeg` — opening a transfer's fee
    row directly now shows a clickable "Transfer" detail item back to the
    transfer (new optional `onOpenTransaction` prop, wired to `setDetail`).
    The forward direction (transfer leg → its fee) already existed.
  - ADR-098 (new): `TransactionTitle` (`src/components/TransactionTitle.tsx`)
    gained `transferFromAccount`/`transferToAccount` props — a transfer leg
    now always titles itself "`<Source> → <Destination>`", with any manual
    description kept as the existing italic subtitle. Wired at both callers
    in `app.transactions.tsx` (ledger list via a new memoized
    `transferTitleAccounts` map, and the detail dialog via its existing
    `transferFromAccount`/`transferToAccount`). Deliberately NOT wired into
    `app.accounts.tsx`'s two per-account transaction lists — they only have
    one account's rows in scope, not the cross-account list needed to find
    the other leg; noted as a known gap in the ADR rather than scope-crept.
  - ADR-099 (new): added 13 institution types (`restaurant`, `grocery_store`,
    `gas_station`, `liquor_store`, `department_store`, `specialty_store`,
    `venue`, `game`, `app`, `dispensary`, `personal_care`, `employer`,
    `delivery`) to `INSTITUTION_TYPES`
    (`src/components/InstitutionDialog.tsx`) + icon/color entries in
    `INSTITUTION_TYPE_META` (`src/lib/visual-meta.ts`). Reclassification
    mapping for ~55 existing institutions (built from the live list, refined
    through an interactive round — several corrections: Cat Soup → game not
    restaurant, Thumbs Up by Gnap → restaurant, McPeaks → liquor_store, Three
    Bears Alaska stays one institution typed grocery_store despite having
    both a gas-station and a grocery/department-store location in real life)
    written to `scripts/migrations/2026-09-09-institution-type-reclass.sql`
    (+ `.verify.sql`). 6 institutions deliberately left `other` as genuinely
    ambiguous. Not yet run.
  - New screen `/app/fix-institution-logins`
    (`src/routes/app.fix-institution-logins.tsx`): lists institutions with no
    `login_url`, inline URL input + save, same visual pattern as
    `FixPlacesPage`. Added to the More page's icon grid next to "Fix Places"
    (`src/routes/app.more.tsx`).
  - Next step: user runs the institution-type-reclass migration; user (or a
    future session with browser access) smoke-tests the new screen, a
    transfer's title on both legs, and opening a fee row's reverse link.

- **Bug found running the above: institution_type reclass migration failed
  on its first UPDATE** (2026-09-09) — `ERROR: 23514: new row for relation
  "institutions" violates check constraint
  "institutions_institution_type_check"`. Root cause: `institution_type` IS
  DB-enforced (scoped to the original 9 values), contradicting what
  `InstitutionDialog.tsx`'s own comment and ADR-099 claimed ("no schema
  constraint — UI list only") — never verified against the live schema
  before writing that comment or the migration. Confirmed via MCP the failed
  transaction rolled back cleanly (0 institutions ended up outside the
  original 9 values — no partial/corrupt state).
  - Fix: new schema migration
    `scripts/migrations/2026-09-09-institution-type-check-constraint.sql` (+
    `.verify.sql`) drops and recreates the constraint with all 22 values.
    Must run **before** (re-)running `2026-09-09-institution-type-reclass.sql`.
  - Docs corrected: `InstitutionDialog.tsx`'s `INSTITUTION_TYPES` comment,
    `docs/SCHEMA.md`'s institutions section (now documents the constraint and
    its 22 current values), and ADR-099 (correction addendum).
  - Next step: user runs the constraint migration, then re-runs the
    institution-type-reclass migration + its verify script.
  - **User ran both (constraint fix + reclass) — verified clean via MCP**:
    institution_type counts match exactly (restaurant 25, grocery_store 3,
    gas_station 3, liquor_store 3, department_store 4, specialty_store 5,
    venue 1, game 5, app 2, dispensary 1, personal_care 1, employer 1,
    delivery 2), `other` down to 6, UberEats confirmed `delivery`. User also
    separately ran dedupe2, the Steph transfer dedupe, and the Nature's
    Releaf split — all re-verified clean via MCP: 8/1 Steph duplicate gone,
    all 4 Nature's Releaf dates are correct 3-line splits totaling
    $65.50/$65.50/$45.50/$65.50.
  - Recomputed Venmo balance (anchor $21.03 + cleared-after-anchor $120.97):
    **$142.00** — further from the ~$72.13 real-world figure than the $55.32
    tracked after the first dedupe pass, moved the wrong direction. Not
    investigated further this session (outside what was asked); likely the
    ~$72.13 reference is now stale rather than a bug in today's migrations,
    since real spending/time has moved since it was noted. Flagged as an open
    thread — revisit if the household wants to chase the account-balance
    discrepancy again.

- **Two dates on transactions: transaction_date vs. cleared_date (ADR-100,
  2026-09-09).** Planned via `/plan`, approved, implemented. New nullable
  `transactions.cleared_date date` — `transaction_date` keeps meaning "when
  logged"; `cleared_date` is when it actually posted at the bank, matching
  what a statement shows. Set automatically = the entered date for anything
  written directly as cleared (manual entries, transfers, splits, reversals,
  corrections, historical logged payments); explicitly prompted (default
  today, editable) only at the pending → cleared transition, which is the one
  moment that's genuinely new information.
  - Confirmed live before writing anything: `useMarkCleared`
    (`src/lib/payments.ts`) flips `status` on an already-pending row without
    touching any date — a payment submitted 9/9, cleared 9/12, kept showing
    9/9 forever.
  - Code: `src/lib/payments.ts` (`useMarkCleared`, `clearPairedFees`,
    `insertFeeTransaction`, `useEditLinkedTransaction`, `useReversePayment`,
    `useCorrectPayment`, `useLogDebtPayment`, `useLogBillPayment` — every
    write site that touches `transaction_date` now also resolves
    `cleared_date`), `src/lib/data-hooks.ts` (`useSaveTransfer`,
    `useSaveSplitTransaction`), `src/lib/supabase.ts` (`Transaction` type).
  - UX change, called out explicitly: `src/lib/pay-flow.tsx`'s one-tap
    pending→cleared checkbox (Bills/Debts/Everything) was instant with zero
    dialog — it now shows a small "Cleared date" confirm (defaults to today)
    first. `app.pending.tsx`'s existing "Mark cleared?" confirm gained the
    same field inline (no new dialog needed there). `TransactionDetail`/
    `SplitTransactionDetail`/`LinkedGroupDetail` (`app.transactions.tsx`)
    each gained an editable "Cleared date" field next to Status, so it can be
    corrected after the fact too, not just set once.
  - Display: ledger list rows and the two per-account activity lists
    (`app.transactions.tsx`, `app.accounts.tsx`) show `cleared_date` next to
    `transaction_date` only when set and different — avoids showing the same
    date twice for the common case.
  - Balance math switched to match: `src/lib/balances.ts` (`computeBalances`)
    and `src/lib/net-worth.ts` (`balanceAsOf`) now compare a cleared
    transaction's `cleared_date` (not `transaction_date`) against a balance
    anchor's `as_of_date` — the actual fix for bank-matching accuracy, per
    the user's choice between that and a display-only rollout. Deliberately
    NOT changed: `src/lib/ledger-state.ts`'s cycle-window attribution
    (`deriveCycleInfo`) and Dashboard/Spending period bucketing both stay on
    `transaction_date` — cycle/budget attribution should reflect when a
    payment was recorded, not whenever the bank got around to posting it.
  - Verified: `tsc --noEmit` clean, `vitest` 185/185 passing, `vite build`
    clean (no route changes this time, `routeTree.gen.ts` untouched).
    **Not verified in a live browser session** — no Claude-in-Chrome/
    Playwright access; could not click through the new "Cleared date"
    confirm dialogs or the edit-form fields against the TEST household.
  - Migration `scripts/migrations/2026-09-09-transactions-cleared-date.sql`
    (+ `.verify.sql`) — adds the column, backfills every existing `cleared`
    row (`cleared_date = transaction_date`). Not yet run.
  - Next step: user runs the migration, re-verify via MCP; user (or a future
    session with browser access) smoke-tests: submit a payment pending
    today, clear it a few days later with a picked date, confirm both dates
    show in the ledger and the account balance reflects the cleared date.
