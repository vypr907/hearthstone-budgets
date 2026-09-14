# SESSION.md

## Session Notes

- **Early-arrival paycheck splits (negative `day_offset`).** Wired the stack to
  support splits that land *before* the pay date, so a paycheck can be anchored
  on its official date while each split posts on its real bank date.
  - `src/lib/format.ts` — new `addDaysISO(date, days)` helper (local-component
    date math, negatives allowed); `format.test.ts` covers it.
  - `src/lib/income-hooks.ts` — `useMarkIncomeReceived`: `shift()` now uses
    `addDaysISO` (the old `toISOString()` path could drift a day once an offset
    was non-zero); every auto-created deposit **and** deduction row now sets
    `cleared_date` (ADR-100 regression — this writer was the one
    `status:'cleared'` path that never set it).
  - `src/routes/app.income-source.$id.tsx` — `SplitDialog`: field relabelled
    "Days relative to pay date", helper text for negatives, writes `day_offset:
    0` not `null` when blank; row summary reads "Nd early" / "Nd late".
  - `src/routes/app.paycheck.tsx` — read-only deposit-splits card: same
    "Nd early / late" wording.
  - Docs: ADR-047 addendum (2026-09-10); `income_source_splits` table added to
    SCHEMA.md (was undocumented); TODO.md limitation re: `transaction_date`
    bucketing of early splits.
  - No schema change. `tsc --noEmit` clean, `npm run build` clean, `vitest run`
    190 pass (5 new for `addDaysISO`).
  - Known issue: 7 pre-existing null-`cleared_date` rows from the 2026-09-10
    ASRC paycheck are not backfilled by this change (harmless — balances fall
    back to `transaction_date`).
  - Next step: user sets ASRC Federal splits to `day_offset` −2 / −2 / −1 in the
    app and starts dating ASRC pay events on the official Friday; optional
    verification pass against the TEST household per the plan.

- **One Checking (x0801) reconciliation vs Jul + Aug 2026 statements — analysis
  pass.** First reconcile of account `40124cdf-…` against its own OnePay PDFs.
  No ADR (data-only, per the USAA-reconcile / 2026-08-24 OnePay-fix precedent).
  - New (all gitignored `planning/` scratch): `2026-07.pdf`, `2026-08.pdf`
    (user-supplied); `build-one-statement-csv.mjs` → `one-checking-statement.csv`
    (Checking-section lines, both months tie to the printed TOTAL: Jul −$712.96,
    Aug −$56.42); `app-one-checking.json` (MCP snapshot); `one-reconcile-report.txt`;
    `one-reconcile-findings.md`.
  - New committed: `scripts/reconcile-one-csv.mjs` — adapted from
    `scripts/reconcile-usaa-csv.mjs` (±7-day window, subset-sum 1–3, merchant→
    institution map, `--json-missing`).
  - Findings: app under-recorded **−$583** of July outflow (nothing logged
    before Jul 17) and **−$28** of August. Current displayed balance was
    ≈ −$600.71 vs Aug 31 statement ending $43.70.
  - Interview: transfer/round-up legs → the real One pocket (cross-referenced
    against the 24 pocket statement pages); bill/debt-linked July items flagged
    for in-app marking, not inserted; August kept as-is (lump/split entries) per
    the user; 2 Aug orphans explained as tx-date vs cleared-date; Jul 2 +$100 →
    Steven's Savings.
  - Written: `scripts/migrations/2026-09-10-one-checking-reconcile.sql`
    (+ `.verify.sql`) via `planning/gen-one-migration.mjs` — 37 plain inserts,
    25 transfer pairs, 1 OnePay advance leg, 3 corrections (paycheck re-date,
    DoubleWood, 1 dup delete), and 8 `account_balances` anchors (One Checking
    7/31 $100.12 + 8/31 $43.70; 6 pockets at 8/31). No ADR. Not yet run — user
    applies it manually in the Supabase SQL Editor, then the `.verify.sql`.
  - Residuals (documented in the .sql header; anchors keep balances exact):
    July span reaches ~−$690 of −$712.96 once the 10 flagged bill/debt items
    are marked in-app (→ **#62**); August reconciled to ~$6, a deeper pass
    (Sunrise Bagel, an Amazon dup, 8/31→Sept items, pocket reconciles) is
    **#61**. OnePay Advance debt needs no change (July cycle nets $0).
  - **Applied 2026-09-10** — user ran the migration in the Supabase SQL Editor.
    All 6 verify checks pass: 37 plain rows + advance + 25 balanced transfer
    pairs in; paycheck re-dated, DoubleWood fixed, dup `6713eac2` deleted;
    July span −$280.58, August −$50.24 (both as projected); One Checking
    `current` now **$119.15** (was ≈ −$600.71). Pockets sit at their Aug 31
    statement endings.
  - Follow-up `scripts/migrations/2026-09-10-one-checking-reconcile-fix.sql`
    (+ `.verify.sql`): the 4 items the main migration couldn't identify, now
    resolved from the user — USAA $100 (cancelled-Auto arrears), Grant $76.42
    ($75 advance + $1.42 fee split), Grant sub $9.99, BowCredit $34.95 (all
    plain Financial expenses / a split, tagged USAA / Grant); plus deletes 2
    duplicate −$5.26 rows and pulls the Aaron's Club/KFC cleared_date to 7/31.
  - **Both migrations applied + all 6 #62 in-app marks done (2026-09-10).**
    July span **−$706.08** vs statement −$712.96; August −$24.17; One Checking
    balance **$119.15**. Cleo debt held at $55.00. #62 closed.
  - **August line reconcile (#61, part 1)** —
    `scripts/migrations/2026-09-11-one-checking-august-reconcile.sql`
    (+ `.verify.sql`), built from a full 210-line pass
    (`planning/aug-reconcile.mjs`). Deletes 8 dup rows — incl. **3 round-up
    pairs the 2026-09-10 migration wrongly re-added** (the app already had them)
    — re-adds the 8/2 Snapchat that `-fix.sql` wrongly deleted, inserts 7
    absent Sunrise Bagel charges + net-zero Obligo/BowCredit pairs, and moves a
    −$8.38 Fred Meyer to its 8/1 statement date.
  - **Applied 2026-09-11, all checks clean.** August span **−$57.14** vs
    statement −$56.42 (within $0.72); July **−$697.70**; One Checking balance
    holds at **$119.15**. One Checking reconcile is done.
  - Remaining on **#61**: 3 loose ends in the user's own entries (the Aug 21–22
    Aaron's cluster −434.03/−97.10/−9.20/−39.46 vs statement −$540.33; Stash
    Aug 4 −$3 vs statement −$12; `d7029670` −$60 unidentified), and the 24 One
    savings-pocket reconciles.
  - **3 loose ends resolved (#61, part 2)** — user interview against their own
    Aaron's receipts. Aaron's: the 8/20 "first Aarons" charge is $434.03 =
    $394.57 paid + $39.46 Protection Plus (same paid+fee split shape as the
    existing Dresser entries) — the ledger's `Debt payment · Aarons` leg had
    the full $434.03 instead of the $394.57 paid portion, double-counting the
    fee leg already recorded beside it. Stash: statement itself shows the ACH
    went from −$3 (Jul) to −$12 (Aug) — a real price change. `d7029670`: user
    confirms a real 8/30 gas purchase; matches the statement's Aug 31 "FRED M
    FUEL #9224 −$60.00" line exactly — `cleared_date` moved to 8/31.
    `scripts/migrations/2026-09-11-one-checking-aaron-stash-fredmeyer-fix.sql`
    (+ `.verify.sql`) — 3 updates, no inserts/deletes, no ADR (data-only).
    Aaron's + Dresser now sum to exactly the Aug 22 statement's −$540.33.
    **Applied 2026-09-11**, all verify checks pass (Aaron's cluster sums to
    exactly −$540.33; Stash −$12.00; gas charge cleared 8/31; balance holds
    at $119.15). One Checking otherwise fully reconciled; only the 24 One
    savings-pocket reconciles remain on #61.
  - **24 One pocket reconciles done (#61, part 3 — issue closed).** Discovered
    the OnePay statement PDFs have a real text layer (`poppler-utils` installed
    this session) — `pdftotext -layout` + `planning/parse-one-statement.py`
    parses every account's Transaction History programmatically instead of
    hand-transcribing. Every one of the 26 One accounts' parsed transactions
    sum to its printed statement TOTAL exactly, both months — a hard
    transcription tripwire. Of the 24 non-Checking pockets, only 6 had any
    Jul/Aug activity (Steven's Savings, Emergency, Food, Games, kitten's
    playroom, Pay Autosave — the same 6 the 2026-09-10 migration already
    anchored); the other 18 are verified $0.00 in both the statement and the
    app for both months — nothing to do there.
    `scripts/migrations/2026-09-11-one-pockets-reconcile.sql` (+
    `.verify.sql`, `planning/diff-pockets.py` /
    `planning/verify-pocket-fixes.py`): date fixes (Emergency's 7/29→7/10,
    kitten's playroom's 7/18→7/17), missing same-day wash legs and interest
    postings inserted, a Pay Autosave amount fix ($30→$5, a mis-entered
    Aug-1 Autosave row), and — the big find — an 8/29 duplicate-$50-transfer
    cluster spanning Checking + Pay Autosave + Savings (the app had 4 "$50
    Internal Transfer" pairs landing in Checking that day; Checking's own
    statement shows only 2). All 6 active pockets now reconcile to their
    OnePay statement net to the penny, both months; existing 8/31 anchors
    needed no changes. **Applied 2026-09-11**, all verify checks pass against
    the live schema (all 6 active pockets reconcile to the penny; dup rows
    gone; Checking 8/29 shows exactly 2 $50 transfer legs). **Issue #61
    closed.**
  - **OnePay Advance repayment fee + display-bug triage + live Sept balance
    gap.** User's `-$225.00` repayment (`e63a2cfa`, 9/9) was correctly sized —
    per every prior cycle, the fee is a separate unlinked leg, not part of
    the linked amount. Confirmed `payments.ts:283` (`applyClearedPayment`)
    only moves `remaining_balance` for linked rows, so adding a plain
    unlinked `-$6.75` fee is risk-free. Filed **#63**: `ReversePaymentButton`
    (`payments.ts:947`) doesn't special-case `isAdvanceDisbursement` on the
    Transactions page the way `app.debts.tsx:1507` does on the Debts page —
    reversing an advance draw there would double-add to `remaining_balance`
    instead of undoing it. Traced the transfer-title ("X → Y") and split
    "Transaction"-fallback rendering to `TransactionTitle.tsx` — root cause
    not pinned down (several plausible candidates: the known Accounts-page
    limitation, single-leg advance rows, or `institution_id`-null standalone
    inserts) pending a concrete example from the user.
  - Live-reconciled One Checking against the user's real-time OnePay feed
    (Sept 1-11, no statement yet). Found + fixed 3 gaps:
    `scripts/migrations/2026-09-11-one-checking-september-fixes.sql`
    (+ `.verify.sql`) — missing Sunrise Bagel -$16.00 (9/2), missing OnePay
    Advance fee -$6.75 (9/9, the item above), and a 1-day date slip on a
    $36.00 transfer. **Applied 2026-09-11.**
  - Even after those 3, the ledger nets to $78.40 vs. the user's confirmed
    real raw balance of $13.14 — a **$65.26 gap neither side could find**:
    ruled out pending/holds, wrong account, safe-to-spend vs. raw balance,
    future-dated/duplicate transactions, split-math errors, and a user
    hand-check of every visible line from 8/28 to today against bank
    screenshots. Per user decision: same migration sets a fresh 9/11 anchor
    at the real $13.14 (current balance correct going forward); the gap
    itself is tracked as **#64** to revisit once the September statement
    closes and a full penny-for-penny reconcile is possible.
  - **Display-bug follow-up, resolved.** The $50/$36 transfers not showing
    "X → Y" were the already-documented Accounts & Balances limitation
    (ADR-098/TODO.md) — user confirmed that's the screen. The split
    ($31.96, "Snacks & Drinks" + "Smoking") showing generic "Transaction" was
    a real bug: traced to `AddTransactionFab.tsx`'s split-submission path
    (`submitExpense`, `mode === "split"` branch) never forwarding the
    selected Place (`merchantId`) into `useSaveSplitTransaction` — unlike the
    plain-expense/income paths a few lines down, which do. Confirmed via
    query: 134/169 split rows in "Our Household" have an institution (from
    other creation paths, e.g. fee/debt-payment splits); the 35 without are
    exactly the ones made through this manual split flow. Fixed (user asked
    for it now, not deferred):
    - `src/lib/data-hooks.ts` — `useSaveSplitTransaction` now accepts
      `institutionId` and stamps it on every inserted row.
    - `src/components/AddTransactionFab.tsx` — passes `merchantId` through.
    - `src/routes/app.transactions.tsx` (`SplitTransactionDetail`) — also
      passes `transaction.institution_id` through on save, fixing a related
      pre-existing bug where *editing* an existing split (delete + re-insert
      via the same hook) silently wiped out whatever institution it already
      had.
    No schema change, no ADR (bug fix, not a design decision).
    `tsc --noEmit` clean, `npm test` 190/190 pass.
  - **Transfer titles now render on Accounts & Balances too** (ADR-098
    addendum — the user pushed back that "not a bug, just a known
    limitation" wasn't good enough; wired it up). `app.accounts.tsx`'s
    `AccountsPage` now builds the same `transferTitleAccounts` map the
    Transactions screen uses (off its own already-fetched full transaction
    list) and threads it through `RecentActivity`, `AccountAllTransactions`,
    and `AccountDetailDialog`. Removed the now-stale TODO.md limitation
    entry. **Verified in-browser**: one-time Playwright smoke-test setup
    (`scripts/smoke/.pw/`, per its README) against the TEST household — a
    throwaway second account + transfer pair, confirmed "Source → Destination"
    renders on both Recent Activity and All Transactions (screenshots), no
    console errors, Transactions screen unaffected, then cleaned up (0 rows
    left, confirmed via MCP). `tsc --noEmit` clean, 190/190 tests pass.
  - **Retroactive backfill for the split-institution bug.**
    `scripts/migrations/2026-09-11-split-institution-backfill.sql` (+
    `.verify.sql`). Of 35 "Our Household" split rows missing an institution,
    only 4 groups (8 rows) actually show the bare "Transaction" fallback —
    the other 27 are paycheck/deduction splits with a description, already
    displaying fine. Backfilled the 4: two 9/1 ATM-withdrawal+fee splits →
    Nature's Releaf LLC (matches the existing cash-withdrawal-at-dispensary
    pattern), one 8/27 gas+snack split → Fred Meyers, and the $31.96
    9/3 Snacks & Drinks/Smoking split (the one screenshotted) → McPeaks per
    user confirmation (OnePay's feed shows it as "General Store Badge,
    North Pole AK", no matching institution existed by that name; McPeaks
    is the user's most common institution for this category pairing).
    Not yet applied — user runs it manually.
  - All of the above: committed and pushed (589fed2).
  - **Dave ExtraCash debt corruption diagnosed + fixed.** User logged 2×$50
    advances + 2×$5 overdraft fees on 9/4 (20-90s apart); only $55 (one $50 +
    one $5) landed instead of $110, and `next_due_date` stayed stuck at 8/27
    instead of rolling to 9/10. Root cause: the already-known bug class at
    `app.debts.tsx:1551` ("found via the OnePay Advance incident,
    2026-08-24") — every debt-balance mutation (`useCreateAdvance`,
    `useAddDebtAdjustment`, `applyClearedPayment`) computes
    `next = <browser's currently-held remaining_balance> + amount` and writes
    that absolute value, never an atomic DB increment; two mutations close
    together silently overwrite each other. `debt_adjustments` (an
    independent insert-per-event log, immune to the bug) durably showed all
    4 real 9/4 events summing to exactly $110, matching the user's own
    expectation, and confirmed the same race hit the second 8/27 payment
    too (should have satisfied that cycle and rolled the due date to 9/10).
    `scripts/migrations/2026-09-11-dave-extracash-fix.sql` (+ `.verify.sql`)
    sets remaining_balance/minimum_payment to 110.00, cycle_paid_to_date to
    0, payment_status to unpaid, next_due_date to 2026-09-10. Not yet
    applied. Also flagged: "Dave ExtraCash" the real `accounts` row (credit
    type) never receives any transactions — by design, matching every other
    advance-type debt (OnePay Advance has no backing account at all); the
    debt's own `remaining_balance` is the sole source of truth.
  - **ADR-101: atomic debt-balance RPCs** (user: "fix it properly now" — 2nd
    time this race has bitten, OnePay 8/24 + Dave today).
    `scripts/migrations/2026-09-11-atomic-debt-balance-rpcs.sql` (+
    `.verify.sql`, SCHEMA CHANGE) adds `apply_debt_advance` /
    `apply_debt_adjustment` (`security invoker`) — the entire debt-row update
    (balance, minimum_payment mirror, ADR-066 reactivation, payoff-date
    patch, due-date-fill-if-blank) in one atomic `UPDATE`, so concurrent
    calls on the same row always serialize instead of overwriting each
    other. Converted `useCreateAdvance`, `useAddDebtAdjustment`,
    `useDeleteDebtAdjustment`, `useDeleteAdvance` (data-hooks.ts) and
    `useLogDebtPayment`'s historical branch (payments.ts) to call these
    instead of client-side read-then-write. Removed now-unused
    `advanceReactivationPatch` import. NOT covered (too big a rewrite for
    this pass): `applyClearedPayment`'s in-cycle branch, `useReversePayment`.
  - **ADR-102: debts can link to a real account** (user: "actually wire it
    up" + "general column", both explicitly confirmed).
    `scripts/migrations/2026-09-11-debt-linked-account.sql` (+
    `.verify.sql`, SCHEMA CHANGE) adds `debts.linked_account_id` +
    `debt_adjustments.mirror_transaction_id` (no FK, matches this table's
    existing convention), sets Dave ExtraCash's link. When set, every
    balance-changing flow now also writes a mirror transaction on that
    account (never `linked_debt_id`-tagged, so cycle math can't double-count
    it): advance draws share the deposit leg's `transfer_group_id` (so
    `useDeleteAdvance`'s existing delete-by-group needed no change);
    adjustments/fees get their own mirror, id stored on the
    `debt_adjustments` row for `useDeleteDebtAdjustment` to clean up;
    repayments gain a `transfer_group_id` (new — coexists with the existing
    `split_group_id` used for fee-pairing) paired with a credit mirror.
    Filed **#65**: `useReversePayment` / `useDeleteLinkedTransaction` don't
    know about this pairing yet, so reversing/repair-deleting a mirrored
    repayment orphans its mirror leg — not yet triggered against real data.
    No UI picker yet to set `linked_account_id` on a debt (done via
    migration for now, same as Dave).
  - `tsc --noEmit` clean, `npm test` 190/190 pass throughout. User applied
    all 3 migrations (verified via MCP: functions exist as `security
    invoker`, columns exist, Dave ExtraCash reads $110/9-10/linked
    correctly).
  - **UI picker added**: `app.debts.tsx`'s Edit Debt dialog gains a "Linked
    account (optional)" `Select`, right below "Usual payment account" — sets
    `linked_account_id` for any debt, not just Dave.
  - **End-to-end verified via Playwright against the TEST household**
    (`scripts/smoke/.pw/verify-debt-mirroring.mjs`, cleanup is
    timestamp/query-based so a mid-script failure can't orphan data — this
    mattered: an earlier version of the script itself left orphaned rows
    across a few failed attempts before the selectors were right, all
    cleaned up and confirmed via MCP). Linked "TEST Debt Advance" to a
    throwaway account via the new picker, fired 2 advances back-to-back (the
    exact race that hit Dave ExtraCash), one fee, one payment — first run
    caught a real bug (see below), second run: balance $83 exactly as
    expected (50+20+20+3-10), 4 correct mirror transactions, none carrying
    `linked_debt_id`, `debt_adjustments.mirror_transaction_id` set
    correctly. Restored the TEST debt and deleted everything created.
  - **ADR-101 addendum**: the Playwright run exposed a live instance of the
    gap already flagged as deliberately uncovered — `useLogDebtPayment`'s
    in-cycle branch (`applyClearedPayment`) was still using the stale `debt`
    object the payment form captured on open, so a payment logged shortly
    after the two advances paid down the *pre-advance* balance ($40 instead
    of $83). Since "draw, then pay" is a normal session, not a rare
    double-click, fixed now rather than fully deferred:
    `useLogDebtPayment` re-fetches the debt row immediately before calling
    `applyClearedPayment`. Not a full fix (`applyClearedPayment` itself
    still isn't atomic) — filed **#66** for the remaining, much smaller
    window, tracking the eventual full rewrite. Re-ran the same Playwright
    verification after the fix: all green.
  - **Committed and pushed** (all of ADR-101, ADR-102, the Dave fix, the
    September Checking fixes, and the linked-account UI picker together).
  - **Issue #66 fixed** (user: "let's fix 66", worked via plan mode — 2
    research/design agent passes mapping every caller/dependency of
    `applyClearedPayment` before writing SQL, given it's core cycle/arrears
    logic with zero existing test coverage). Two new atomic Postgres
    functions, `apply_cleared_debt_payment` / `apply_cleared_bill_payment`
    (`scripts/migrations/2026-09-13-atomic-cleared-payment-rpcs.sql` + a
    pure `shift_billing_date` helper porting `shiftDate`/`advanceDate` from
    `src/lib/format.ts` — has to run inside the atomic statement, not be
    pre-computed in JS, or the date-roll itself would still race on a stale
    `next_due_date`), fold the full shortfall/cycle-satisfied/arrears/
    due-date-roll state machine into one locked `UPDATE` per kind. The
    bill's "exceeds what's owed" rejection is now enforced atomically too
    (sentinel `RAISE EXCEPTION` rolling back the `UPDATE`). `payments.ts`'s
    `applyClearedPayment` keeps its exact signature/return shape — all 8
    call sites needed zero changes. `tsc --noEmit` clean, `npm test`
    190/190. Scope boundaries (documented, not dropped): `priorArrears`
    stays a client-computed pure-function parameter (`arrears.ts`); 5
    sibling functions with the same racy pattern (`useMarkUnpaid`,
    `useResetCycle`, `useReversePayment`, `rollbackClearedPayment`,
    `useCorrectPayment`) are unconverted, filed as **#67**.
  - Wrote `scripts/smoke/.pw/verify-cleared-payment.mjs` (7 scenarios:
    shortfall+satisfy, monthly vs biweekly resolve, one_time closeout, bill
    cap rejection + unchanged-row proof, arrears overflow, the actual race
    via two concurrent RPC calls). Supabase MCP was disconnected this
    session (needs reauth) — verified the script's failure path directly
    against the TEST household via `test-db.mjs`'s own client instead (not
    MCP-dependent): clean "function not found" error, correct cleanup, 0
    rows orphaned. **User applied the migration** — full smoke-test run:
    **34/34 checks pass**, including the race scenario (two concurrent
    payments on the same debt row correctly sum instead of one clobbering
    the other, cycle resolves exactly once). TEST household confirmed clean
    afterward. `tsc --noEmit` clean, `npm test` 190/190. **Issue #66 done.**
- **Cash tracking — "Cash Back" combo entries (ADR-103).** Interviewed the
  user (plan mode) to design a fix for double-counting a blended register
  swipe (part purchase, part cash back — e.g. buy a snack, pull $100 cash
  back, then later spend that cash), previously entered as a same-account
  split whose cash-back portion counted as spend twice. Verified live via
  the read-only Supabase MCP first: no `cash`-type account existed yet; the
  "Cash & Checks" category had exactly 2 transactions ($60, 2026-07-02).
  - `src/lib/payments.ts` — new `insertCashBackPurchaseRows`, a sibling of
    `insertFeeTransaction` generalized from one fixed-category fee amount to
    N caller-categorized purchase rows.
  - `src/lib/data-hooks.ts` — new `useSaveCashBack` (writes an ADR-056
    transfer pair to a Cash account plus the purchase rows, same
    `split_group_id`/`transfer_group_id` pairing as a transfer fee);
    `useDeleteTransferPair` now deletes by either column instead of only
    `description ILIKE 'Fee:%'` rows, so deleting a transfer also cleans up
    a paired Cash Back purchase (or fee) — a plain superset, safe because
    that id is never reused by a bill/debt payment+fee group.
  - `src/lib/split-groups.ts` — `classifyLedgerGroup`/`isCategorySplitGroup`
    take a new `transferGroupIds` set; a `split_group_id` that's also some
    transfer's `transfer_group_id` classifies as `"cash-back-purchase"`,
    never `"category-split"`, so a 2+-line purchase doesn't wrongly open the
    whole-group split editor. `src/routes/app.transactions.tsx` threads that
    set through; the existing `linkedTransferLeg` banner (built for fee
    rows) now shows for Cash Back purchase rows for free.
  - `src/lib/balances.ts` — `SPENDABLE_TYPES` gains `"cash"` (found: it was
    silently missing, so a cash account would've been excluded from the
    spendable-money total despite `is_spendable = true`).
  - `src/components/AddTransactionFab.tsx` — new "Cash Back" mode: account,
    purchase lines (`SplitLinesEditor`, reused as-is), cash-back amount,
    destination Cash account (defaults to the signed-in member's own via
    `useCurrentMember`), place, description.
  - Tests: `split-groups.test.ts` (new classification cases),
    `balances.test.ts` (`cash` counts as spendable), `internal-transfers.test.ts`
    (end-to-end: the purchase line counts once, the transfer legs never
    count, later cash-spending counts once more — never the withdrawn $100
    twice). `tsc --noEmit` clean, `npm test` 199/199 (was 190).
  - No schema change — `account_type`/`split_group_id`/`transfer_group_id`
    already existed and are unconstrained enough. Wrote
    `scripts/migrations/2026-09-13-add-cash-accounts.sql` (+ `.verify.sql`)
    seeding the two per-member Cash accounts — data only, user runs it
    manually in the Supabase SQL Editor per the standard workflow.
  - **Filed Issue #68** for migrating the 2 legacy "Cash & Checks" rows.
  - **Verified end-to-end via Playwright against the TEST household**
    (`scripts/smoke/.pw/verify-cash-back.mjs`, ADR-083 preflight run first,
    all green): logged in as the test user, drove the real "Cash Back" UI
    (Snacks $8.50 + $25 cash back into a throwaway Cash account), confirmed
    via the DB the 3 rows land correctly tagged (purchase row's
    `split_group_id` = the transfer's `transfer_group_id`), confirmed the
    purchase row's detail view shows the linked-transfer banner, then
    deleted the transfer and confirmed all 3 rows — transfer pair AND the
    paired purchase row — were removed (the widened `useDeleteTransferPair`
    cleanup). Zero browser console errors. TEST household confirmed clean
    afterward via the MCP (0 leftover rows). **ADR-103 implemented and
    verified.**
  - **Committed and pushed** (`4e7a125`).
  - **User ran the seed migration.** Verified live via the MCP: "Cash — You"
    (`eba5d1c6…`, owner `f93a0ac9…`) and "Cash — Stephanie" (`8fa057e0…`,
    owner `545e684e…`), both `is_spendable`/`include_in_net_worth` true, no
    institution, $0 starting balance. **ADR-103 fully live — done.**
  - **Advances: category+place on creation; bill payments gain fee lines.**
    Two changes, user-requested:
    - `useCreateAdvance` (`src/lib/data-hooks.ts`) now inherits
      `category_id`/`institution_id` from the debt on the deposit
      transaction (and `institution_id` only on the mirror leg) — matches
      what `useLogDebtPayment` already did for repayments. **ADR-056
      addendum.**
    - `LogBillPaymentDialog` + `useLogBillPayment`
      (`src/lib/payments.ts`) gain fee/interest lines, porting the pattern
      from `LogDebtPaymentDialog` (`DebtPaymentLine` renamed `PaymentLine`,
      now shared). **ADR-084 addendum**, revisiting the 2026-09-04
      "no fee lines, out of scope" call after the user hit it on a real
      Rent (Flex) payment.
    - Also answered (no code): why a pending bill payment blocks a second
      Submit-button payment (ADR-036 by design — "Log a payment to this
      bill" isn't gated, though, and works today); and how to add a fee to
      an already-logged lone debt payment (Reverse it, cleared only, then
      re-log with a fee line — no in-place edit path, by ADR-091 design).
    - `npx tsc --noEmit` clean, full `vitest` suite green (199 tests).
      Verified end-to-end against the TEST household via a throwaway
      Playwright script (Playwright installed locally with `--no-save`,
      not persisted to `package.json`): recorded a real advance and
      confirmed its transaction got both fields from the debt; logged a
      bill payment with a fee line and confirmed the payment+fee group
      (shared `split_group_id`, fee row unlinked/categorized "Fees")
      renders and edits correctly in `LinkedGroupDetail`. Zero console
      errors both times. Test mutations (the advance draw, the bill
      payment+fee, one pre-existing fixture accidentally deleted along the
      way) were all reversed/restored; TEST household confirmed back to
      its prior state via the MCP.
    - Next: none — both changes are complete and verified. User still
      needs to set `category_id`/`institution_id` on their own advance
      debts (via the existing debt edit form) for the ADR-056 fix to show
      up on new draws.
