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
