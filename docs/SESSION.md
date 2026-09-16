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

## 2026-09-16 — Credit-card/account linking migration verified live
- Ran `scripts/migrations/2026-09-15-credit-debt-account-links.sql` was
  confirmed by the user; verified all 4 checks via the read-only MCP
  (`.verify.sql` queries): Milestone/CreditOne/Mission Lane linked to the
  right accounts, each account's `starting_balance` matches the anchor
  math exactly (-268.00 / -219.55 / -1271.89), GTC untouched, and Mission
  Lane's 2 pre-existing transactions plus its anchor reproduce the
  pre-migration $1,318.01 exactly — no balance jump on any of the three.
- ADR-102: linking is live. Next step is the user's own manual smoke
  check in the running app (confirm displayed balances read unchanged,
  then log one real purchase on each linked account and confirm the
  debt's shown balance moves by exactly that amount) — not yet done.

## 2026-09-16 — SCRATCHPAD "Next Steps": 5 small UI/UX fixes
Researched via 3 parallel Explore agents, interviewed the user on 4 open
judgment calls, wrote/approved a plan, implemented all 5. `tsc --noEmit`
and `vitest run` (214/214) clean after each item.

1. **Advances section gated on debt_type === "advance"** — was gated only
   on `!linked_account_id`, showed for every debt type. `app.debts.tsx`
   (`DebtAdjustments`). Confirmed via MCP no orphaned advance-type
   `debt_adjustments` rows on non-advance debts, so a clean type gate.
2. **Add Transaction preset support** — new
   `src/components/AddTransactionPreset.tsx`
   (`AddTransactionPresetProvider` + `useAddTransactionPreset`), wrapping
   the app shell in `app.tsx`. `AddTransactionFab` now reads open state
   from context and seeds `accountId`/`merchantId` from a preset. "Add
   transaction" buttons added to `AccountDetailDialog`
   (`app.accounts.tsx`) and `InstitutionDetail` (`app.institutions.tsx`),
   each opening pre-filled instead of requiring the user to close and
   manually reselect.
3. **Clickable link between a linked debt and its account (ADR-105)** —
   new pattern: `validateSearch({ open?: string })` on `/app/accounts` and
   `/app/debts`, each opening the matching detail dialog on mount and
   clearing the param. `DebtDetailDialog`'s Account field is now a link to
   the linked account; `AccountDetailDialog` gained a reverse "Linked
   debt" field. Also fixed an incidental bug found along the way:
   `DebtDetailDialog`'s account lookup was keyed off `institution_id`
   instead of `linked_account_id` — harmless pre-linking, silently wrong
   once a debt could actually be linked.
4. **Accounts & Balances grouped by institution** — `app.accounts.tsx`
   now always renders accounts clustered by institution with a per-group
   subtotal and a grand total above the list (was one flat list, no
   totals at all).
5. **Dashboard tap-to-see breakdown** — `obligationStatusTotals`
   (`app.index.tsx`) now also collects the matched bills/debts per bucket
   (paid/pending/overdue/remaining), not just sums. Each of the 4
   `StatusBreakdownCard` rows (Paid so far/Remaining/Pending/Overdue) is
   now a tap target (`StatusRow`, reuses the existing tap-triggered
   Radix Popover pattern from `HelpButton`) opening a small list of the
   matching items.

Known gap: `gh` CLI isn't installed in this environment, so the 5
GitHub Issues called for by the plan (ADR-087) weren't created — punt to
the user or a future session with `gh` available.
No schema change; no migration. No Playwright/TEST-household pass this
session (same environment gap as prior sessions) — manual verification in
the running app is still outstanding.

## 2026-09-16 — `gh` CLI working again: retroactive Issues for the 5 fixes above
`gh auth status` now succeeds (user restarted VS Code specifically to fix
this). Created and immediately closed 5 GitHub Issues (#69–#73), one per
item in the "SCRATCHPAD Next Steps" entry above, each referencing commit
`0e6ebc8` (already implemented/pushed). Satisfies ADR-087's "actionable
work = GitHub Issues" rule retroactively. No code change.

## 2026-09-16 — Accounts & Balances: institution group header + watermark icon
User feedback on item 4 above (institution grouping): make the group
header more prominent with a collapse toggle, and de-emphasize the
per-account institution icon.
- `src/routes/app.accounts.tsx` — each institution group header is now a
  full-width tappable button (`bg-muted/40`, rounded, bordered) showing a
  32px `ObligationIcon`, the institution name, an account count, the
  group subtotal, and a `ChevronDown` that rotates -90° when collapsed.
  New `collapsedGroups` state (`Set<string>` of institution id /
  `"__none__"`), all expanded by default; collapsed groups just skip
  rendering their account cards.
- `src/components/ObligationIcon.tsx` — new `ObligationWatermark`
  component: renders the institution logo (or type/name-derived emoji
  fallback) as a large, faint (`opacity-[0.09]`/`0.12`), absolutely
  positioned background mark instead of a normal avatar — same visual
  language as the oversized faint logo watermark already used on the
  Everything page (`app.everything.tsx`), reused here rather than
  duplicated.
- Each account card's header row now uses this watermark (behind the
  name/type text) in place of the old left-aligned `ObligationIcon`
  avatar; the row and its siblings got `relative` (watermark is
  `absolute`, first in paint order) and the card got `overflow-hidden`
  so the oversized mark crops to the row instead of bleeding out —
  exactly the stacking trick the Everything page's row cards already
  rely on.
- `tsc --noEmit` clean. No schema change; no ADR (presentation only). Not
  yet checked in a running browser — recommend a quick `npm run dev` pass
  (Codespace or outside-sandbox terminal) to confirm the watermark crop
  and collapse toggle look right before considering this done.

## 2026-09-16 — Watermark follow-up: bigger, full card height, right-of-center
User feedback after seeing it: logo should span the full card height (not
just the header row) and sit slightly right of center rather than hugging
the edge.
- `ObligationWatermark` (`src/components/ObligationIcon.tsx`) — image now
  `h-full w-36` anchored `left-[58%]` `-translate-x-1/2`, `top-0`
  (previously a small `h-16 w-16` pinned to the row's right edge); emoji
  fallback grew to `text-8xl`, same `left-[58%]` centering.
- `src/routes/app.accounts.tsx` — moved the watermark up to be the first
  child of `CardContent` (was nested inside just the header row), so it
  now spans the whole card. `CardContent` itself got `relative`; every
  section below it (header row, balance grid, recent activity wrapper,
  log-balance button) now also carries `relative` so each still paints
  above the watermark in the CSS stacking order — the header row alone
  was no longer enough once the mark moved outside it.
- `tsc --noEmit` clean. Still unverified in a running browser.

## 2026-09-16 — Account detail dialog: footer overflow fix + button reshuffle
User feedback on the SCRATCHPAD "Add transaction" button (item 2, added
earlier this session): it was overflowing the dialog's bounds. Also asked
to deprioritize "Log balance" and shrink "Edit" to icon-only.
- `AccountDetailDialog` (`src/routes/app.accounts.tsx`) footer went from
  4 buttons (Add transaction / Log balance / Edit / Close) to 3: forced
  `flex-row flex-wrap` (was `DialogFooter`'s default
  `flex-col-reverse`/`sm:flex-row` with no wrap, so 4 full-text buttons
  in a row could exceed the dialog width) with `Add transaction`/`Close`
  each `flex-1` and `Edit` now `size="icon"` (pencil only, `aria-label`
  for accessibility).
- "Log balance" moved out of the footer entirely, into the body: now a
  `size="sm"` button sharing a `justify-between` row with
  `InstitutionLoginButton`, right after `DetailGrid` (so it sits below
  the "Linked debt" field, same spot `InstitutionLoginButton` already
  occupied) — "across from" the Log In button when one exists, alone on
  the right when it doesn't.
- `tsc --noEmit` clean. Still unverified in a running browser.

## 2026-09-16 — Watermark follow-up #2: pin to top, not vertically centered
User caught it looking pinned to the top only on short cards (no
transactions) and drifting down on taller ones (with transactions) — the
`h-full` box was correctly spanning the full card, but `object-contain`'s
default `object-position: 50% 50%` was centering the actual logo *within*
that tall box, so it visually crept toward the card's vertical middle as
the box got taller.
- `ObligationWatermark` (`src/components/ObligationIcon.tsx`) — logo
  image gained `object-top` alongside `object-contain`, anchoring the
  rendered logo to the top of its box regardless of box height. Emoji
  fallback switched from `top-1/2 -translate-y-1/2` (vertical-center) to
  `top-0` (pinned top), for the same consistent behavior.
- `tsc --noEmit` clean. Still unverified in a running browser.

## 2026-09-16 — Milestone: reconciled account/debt against real Jul/Aug/Sep statements
User added `docs/planning/milestone_JUL.pdf`/`_AUG.pdf`/`_SEP.pdf` and
asked to correct the Milestone account/debt to match. Direct continuation
of the 9/15 ADR-102-addendum linking migration, whose own comment
explicitly punted on exact numbers pending real statements.
- **Root cause of the wrong balance**: a leftover `account_balances`
  snapshot (2026-07-09, $298.45 — logged 2026-07-28, the same day the debt
  was first entered, before it was linked to this account) was silently
  overriding `accounts.starting_balance` as the anchor
  (`computeBalances` always prefers the latest snapshot). Confirmed with
  the user and deleted.
- **Two real payments already existed** in `transactions` (`linked_debt_id`
  tagged, on the *funding* accounts — Venmo 7/28 -$20, One Checking 9/11
  cleared 9/15 -$20) but were never mirrored onto the Milestone account
  itself, since both predate the 9/15 account link. The 7/28 one matches
  the statement's own 07/27 "PAYMENT RECEIVED" (same event, not a
  duplicate); the 9/11 one postdates the Sept 9 statement close, not yet
  on any statement. Both given a proper mirror leg + shared
  `transfer_group_id`, matching the exact shape
  `useMarkSubmitted`/`useMarkCleared` produce.
- Added the 3 statement purchases missing from the ledger entirely: `06/15
  FRED M FUEL #9224 -$10.00` (Auto & Transport), `07/29 CRUMB.PET TAMPA FL
  -$8.95` and `08/03 CRUMB NEWARK DE -$8.95` (both Pets, user's call —
  ambiguous merchant names). Descriptions kept verbatim from the statement.
- Reconciled anchor: `accounts.starting_balance` -268.00 → **-288.45**
  (July statement's Previous Balance). Running the full ledger forward
  from there reproduces all three statement closing balances exactly
  ($298.45 July, $296.35 Aug **and** Sept) and lands on a current true
  balance of **-$276.35** (the 9/11 payment moves it past Sept's own
  close).
- `debts` row (`remaining_balance` 268.00→276.35, `minimum_payment`
  10.00→20.00, `next_due_date` 2026-08-08→2026-10-08) kept in sync with
  the account — still the baseline several mutations read before writing
  back (Issue #67), even though display now derives from the account.
- Deliberately did **not** touch `payment_status`/`cycle_paid_to_date`
  (the existing "Sync stored status" button on the Milestone debt's detail
  dialog — `useSyncStoredStatus`, `src/lib/payments.ts` — reconciles those
  from the ledger; told the user to tap it once after running the SQL) or
  `opening_arrears`/`arrears_as_of`/`arrears_paid_to_date` (no evidence
  they're wrong, arrears walk is clamped ≥ 0 regardless).
- `scripts/migrations/2026-09-16-milestone-statement-reconciliation.sql`
  (+ `.verify.sql`) — data-only, no schema change, no new ADR. Not yet
  applied — user runs it manually in the Supabase SQL Editor.
- CreditOne and Mission Lane are out of scope (no statements provided this
  session) — same stray-snapshot risk hasn't been checked for either.

## 2026-09-16 — CreditOne & Mission Lane: reconciled account/debt against real statements
User added `docs/planning/CreditOne1.pdf` (Jun 26-Jul 25 close),
`CreditOne2.pdf` (Jul 26-Aug 25 close), `CreditOne3.pdf` (May 26-Jun 25
close — earliest despite its number), and
`statement_missionLane_JUL/AUG/SEP.pdf`. Same exercise as the Milestone
reconciliation above, for the other two debts that migration's own
comment flagged as provisional. GTC stays out of scope (debt-only, no
matching account).
- **Same stray-snapshot bug as Milestone, confirmed on both**: a
  leftover `account_balances` row logged 2026-07-28 (the day both debts
  were first entered, before either was linked) was overriding
  `starting_balance` — CreditOne's ($309.55, 7/9) and Mission Lane's
  ($1,485.81, 7/24). Both deleted.
- **New bug found on Mission Lane**: its 2 existing "Credit Protect Fee"
  transactions (751fac58/b5c9bc81, already correctly matching the Aug/Sep
  statements) carried `linked_debt_id` despite not following the `"Fee:"`
  naming convention `isFeeTransaction()`/ADR-046 needs to exclude a fee
  from payment-cycle math — almost certainly why the debt's stored
  `cycle_paid_to_date` was $46.12, exactly the sum of those two fees, as
  if they'd been paid toward the minimum. Cleared `linked_debt_id` on
  both per the user (matches every other fee/purchase here: plain account
  transactions, no `linked_debt_id`).
- **4 real payments already in the ledger** (`linked_debt_id`-tagged, on
  funding accounts) were never mirrored onto their card's own account —
  all four predate their debt being linked (9/15): CreditOne 7/20 -$30
  (matches CreditOne1's statement) and 8/31 -$60 (after CreditOne2's
  close, not on any statement); Mission Lane 7/17 -$250 (matches Aug
  statement) and 8/28 -$121.68 (matches Sept statement). Each given a
  mirror leg + shared `transfer_group_id`.
- **2 bounced Mission Lane payments** ($102.93 6/27→7/1, $50.00
  7/27→7/30, each reversed days later with a $41 fee) were never recorded
  at all. Per the user: skipped the wash pair (net zero), recorded only
  the real $41 fee each time.
- **2 Mission Lane purchases linked to their existing bills**, per the
  user: `GOOGLE *SOLO YOUR GIG` $18.99 → bill **Solo**, category Side Gig;
  `GOOGLE *Google One` $10.54 → bill **Google One**, category Software &
  Tech (both `linked_bill_id`, not just categorized).
- Added every other real statement fee/interest/credit line as a plain
  account transaction (Credit Protect, Late Fee, Annual Fee, Express
  Payment Fee, Interest Charge, Cash Back Credit, two tiny CreditOne
  finance-charge/credit-protection adjustments) — reused existing
  categories throughout (Fees, Interest Charge, Cash Back / Rewards,
  Credit), none invented.
- Reconciled anchors: CreditOne `starting_balance` -219.55 → **-299.14**
  (CreditOne3's Previous Balance); Mission Lane -1271.89 → **-1709.55**
  (July statement's Previous Balance). Running each ledger forward
  reproduces every statement closing balance exactly (CreditOne: $339.90
  / $289.87 / $338.63; Mission Lane: $1,735.81 / $1,600.87 / $1,541.36)
  and lands on current true balances of **$278.63** (CreditOne, the 8/31
  payment moves it past CreditOne2's own close) and **$1,541.36** (Mission
  Lane — no payment known after the Sept 2 close, so it matches that
  statement exactly).
- `debts` rows kept in sync: CreditOne `remaining_balance` 219.55→278.63,
  `minimum_payment` 30.00→90.00, `next_due_date` 2026-08-21→2026-09-21;
  Mission Lane `remaining_balance` 1318.01→1541.36, `minimum_payment`
  100.00→78.17, `next_due_date` 2026-08-27→2026-09-27 — both set from
  each debt's latest known statement.
- Deliberately did **not** touch `payment_status`/`cycle_paid_to_date`/
  `opening_arrears`/`arrears_as_of`/`arrears_paid_to_date` — same
  "Sync stored status" button as Milestone; told the user to tap it on
  each debt's detail dialog afterward if it appears (more likely to
  actually appear for Mission Lane this time, since the `linked_debt_id`
  fix changes what the ledger derives).
- `scripts/migrations/2026-09-16-creditone-missionlane-reconciliation.sql`
  (+ `.verify.sql`) — data-only, no schema change, no new ADR. Not yet
  applied — user runs it manually in the Supabase SQL Editor.

## 2026-09-16 — CreditOne/Mission Lane migration verified live
User ran the SQL and tapped "Sync stored status" on both debts. Verified
via the read-only MCP: `debts.remaining_balance`/`minimum_payment`/
`next_due_date` match exactly (CreditOne 278.63/90.00/2026-09-21; Mission
Lane 1541.36/78.17/2026-09-27); both accounts' `starting_balance` + full
ledger reproduce those same totals (15 transactions each); both stray
snapshots gone; Mission Lane's 2 fee rows no longer carry `linked_debt_id`.
`payment_status` synced to `unpaid` with `cycle_paid_to_date` reset to
`0.00` on both — correct, since neither has a payment in the current
(September) calendar-month cycle yet.

## 2026-09-16 — Debt detail: show the linked account's activity too
User asked 3 workflow questions after the reconciliations, to make sure
the debt/account pairs don't drift again: (1) does Add Transaction work
normally for a purchase on a linked debt's account, (2) do Submit
Payment/Mark Cleared/pending still work on the Debts and Everything
screens, (3) would it be better if both the account and the debt showed
all transactions.
- (1) and (2) confirmed working by reading the code, no change needed:
  `AddTransactionFab`'s `submitExpense()` writes a plain transaction with
  no `linked_debt_id` unless explicitly linked, and `effectiveDebtBalance`
  (`src/lib/balances.ts`) already derives a linked debt's balance from
  exactly those account transactions. `usePayFlow` → `useMarkSubmitted`/
  `useMarkCleared` (`src/lib/payments.ts`) already write both the
  `linked_debt_id` cycle-math row and a mirror credit on the linked
  account (shared `transfer_group_id`) — the "Part 0" fix from the
  ADR-102 addendum session, confirmed implemented.
- (3) was a real gap: `RecentDebtTransactions`
  (`src/routes/app.debts.tsx`) only ever filtered by `linked_debt_id` —
  a linked debt's own detail page never showed the plain purchases that
  actually make up its derived balance, even though the Account page
  already showed everything. New `LinkedAccountActivity` component
  (same file, next to `RecentDebtTransactions`) shows the linked
  account's full transaction list read-only (no Delete/Correct/Reverse —
  those are payment-specific and don't apply to a purchase; editing stays
  on the Account page). Wired into `DebtDetailDialog` right after the
  existing "Recent transactions" section, gated on `debt.linked_account_id`
  specifically (not the ADR-105 institution-match fallback `account` var,
  which can be truthy for an unlinked debt too) — so only Milestone/
  CreditOne/Mission Lane get the new section; every other debt is
  unchanged. Reuses the same month-stepper prop and `TransactionDetail`
  tap-to-view pattern `RecentDebtTransactions` already uses.
- `tsc --noEmit` clean, 214/214 tests pass. No schema change, no ADR
  (pure UI addition). Not yet checked in a running browser.

## 2026-09-16 — Credit accounts: fix Current/Spendable sign and math
User noticed Mission Lane showing Current -$1,568.77 and Spendable
-$1,583.76 — both wrong for a credit account: Spendable should be
available credit (`credit_limit - owed`, e.g. $16.24 here), and Current
should never show a minus sign (a credit balance is always "what you
owe", same as a real card statement's Balance).
- New `accountDisplayBalances()` (`src/lib/balances.ts`, next to
  `creditOwed`/`spendableContribution`, reusing both): passes through
  every non-credit account's raw signed values unchanged; for a credit
  account, `current` drops the sign and `spendable` becomes
  `credit_limit - owed` (can go negative when genuinely over limit;
  `null` when no `credit_limit` is set at all, rendered as "—").
- Searched every render site reading `computeBalances`'s `.current`/
  `.spendable` — only two are per-account (the rest are aggregates,
  already using `creditOwed`/`spendableContribution` correctly, or a
  sort comparator that doesn't need to match display sign):
  `src/routes/app.accounts.tsx`'s `AccountsPage` list card and
  `AccountDetailDialog`, both switched to the new helper.
  `app.institutions.tsx`'s per-account list uses a different raw
  snapshot value (not `computeBalances` output) — out of scope, not
  touched.
- `src/lib/balances.test.ts` — 5 new cases: normal credit owed, over-limit
  (negative Spendable), missing `credit_limit` (`null` Spendable),
  non-credit passthrough (sign preserved), and the `undefined`-balance
  default.
- `tsc --noEmit` clean, 219/219 tests pass. No schema change, no ADR
  (presentation-only). Not yet checked in a running browser.

## 2026-09-16 — Institution links/member accounts/parent-child/bill pause: planning + schema (ADR-106)
User requested 4 related features (multiple institution links, per-spouse
billing tracking, an Amazon/Prime parent-child relationship, marking a
bill inactive) and asked to be interviewed until there was a solid plan.
Researched via 3 parallel Explore agents (institution schema/login
button/dialog; bills is_active read/write sites; household-member
ownership + institution relationships), then 2 rounds of interview
questions to settle: flexible `institution_links` table (not fixed
columns); a real per-member "account" entity at an institution (not just
a tag on each bill/debt); a real `parent_institution_id` link with child
totals rolling up into the parent; and confirmed `bills.is_active`
(already exists in the DB, already read in 4 places, just never had a
UI) only needs a simple toggle, no new status enum.
- **ADR-106** written (`docs/DECISIONS.md`) covering all 4 decisions
  together, plus `docs/SCHEMA.md` updated with the new table/column
  definitions (marked not-yet-applied).
- `scripts/migrations/2026-09-16-institution-links-members-parent.sql`
  (+ `.verify.sql`) — 2 new tables (`institution_links`,
  `institution_member_accounts`, both RLS-joined through `institutions`,
  no own `household_id`, verified against the exact precedent in
  yesterday's `2026-09-15-add-tags.sql`/`transaction_tags`) + 3 new
  nullable columns (`institutions.parent_institution_id`,
  `bills.institution_member_account_id`,
  `debts.institution_member_account_id`). Not yet applied — user runs it
  manually in the Supabase SQL Editor. `bills.is_active` needs no schema
  change, only UI wiring.
- **Next steps** (per the plan, sequenced — not done yet): data hooks in
  `src/lib/data-hooks.ts`; `InstitutionDialog.tsx` gains Links/Member
  accounts/Parent institution sections; `InstitutionLoginButton.tsx`
  evolves to prefer a `bill_pay` link over `login_url` and render extra
  buttons for other links; `BillDialog`/`DebtDialog` gain the active
  toggle and member-account selector; `app.institutions.tsx` +
  `computeInstitutionTotals` (`src/lib/balances.ts`) gain parent/child
  rollup and list decluttering.

## 2026-09-16 — ADR-106 migration applied; types + data hooks added
User ran `2026-09-16-institution-links-members-parent.sql`. Verified live
via the read-only MCP: both new tables exist with RLS enabled + forced,
all 3 new nullable columns exist on `institutions`/`bills`/`debts`.
- `src/lib/supabase.ts` — new `InstitutionLink`/`InstitutionMemberAccount`
  types; `Institution.parent_institution_id`,
  `Bill.institution_member_account_id`,
  `Debt.institution_member_account_id` added.
- `src/lib/data-hooks.ts` — `useInstitutionLinks`/`useUpsertInstitutionLink`/
  `useDeleteInstitutionLink` and `useInstitutionMemberAccounts`/
  `useUpsertInstitutionMemberAccount`/`useDeleteInstitutionMemberAccount`,
  same household-wide fetch-everything shape as `useInstitutions`/
  `useAccounts`, same join-through-institution-ids-then-`.in()` pattern
  `useInstitutionCategories` already uses (RLS itself would already scope
  correctly without that step, but matching precedent). Member-account
  upsert uses `upsert(..., { onConflict: "institution_id,member_id" })`
  since re-saving an existing member's fields must never hit the new
  unique constraint as a duplicate-key error. `parent_institution_id`
  needs no new hook — rides along in the existing `useUpsertInstitution`
  payload.
- `tsc --noEmit` clean, 219/219 tests pass. Next: `InstitutionDialog.tsx`
  (Links / Member accounts / Parent institution sections).

## 2026-09-16 — InstitutionDialog: Links, Member accounts, Parent institution sections
`src/components/InstitutionDialog.tsx`:
- "Login URL" relabeled "Main site" (same field, unchanged behavior) with
  a note that the Log In button prefers a Bill Pay link over it.
- New "Links" section (gated on the institution already being saved, same
  as the existing "Linked accounts" pattern): lists existing
  `institution_links` rows with a delete button, plus an inline add-form
  (kind select + URL, label input only shown for "Other"). The kind
  dropdown hides "Bill Pay" once one exists and only offers "Patient
  Portal" when `institution_type === "medical"` and none exists yet — add
  is immediate (its own mutation), not batched into the main Save,
  matching how "Add account" already works.
- New "Parent institution" select right after Type — only institutions
  with no parent of their own are offered (keeps it to 2 levels without
  real recursion checks). Rides along in the main `useUpsertInstitution`
  payload.
- New "Member accounts" section: one card per household member
  (account #/login username/notes, all optional), batched into the main
  Save alongside Categories — a member's row is only written if at least
  one field is filled in; an existing row is removed via its own small
  trash-icon button (not by clearing all 3 fields to blank and saving).
- `tsc --noEmit` clean, 219/219 tests pass. Next: `InstitutionLoginButton.tsx`
  (prefer a Bill Pay link, render extra buttons for other links).

## 2026-09-16 — InstitutionLoginButton evolved; Institutions screen rollup
- `src/components/InstitutionLoginButton.tsx` — same export name/shape
  (backward compatible), now takes an optional `links` prop: "Log In"
  opens a `bill_pay` link when set, else falls back to `login_url`; one
  extra button per other stored link (Patient Portal, custom "Other").
  Wired at all 3 call sites (`app.accounts.tsx`'s `AccountDetailDialog`,
  `app.debts.tsx`'s `DebtDetailDialog`, `app.institutions.tsx`'s
  `InstitutionDetail`), each fetching `useInstitutionLinks()` once and
  filtering to the relevant institution.
- `computeInstitutionTotals` (`src/lib/balances.ts`) gained an
  `institutions: Institution[] = []` param — a parent's totals now widen
  the candidate account/bill/debt set to include every
  `parent_institution_id === thisId` child too, same filter-and-sum shape,
  the underlying rows never move off their real institution. 4 new tests
  in `balances.test.ts` (no-children regression, child debt/account
  rollup, child's own total stays un-rolled-up).
- `app.institutions.tsx`: top-level list now filters to
  `!i.parent_institution_id` (children hidden — their money's already
  counted under the parent, showing both would double-count). New
  "Sub-institutions" section in `InstitutionDetail` lists a parent's
  children (tap to swap the open dialog to that child, via a new
  `onSelect` prop threaded from `InstitutionsPage`); a child shows a
  "Part of {parent}" row with the same swap-back link. Bills/Debts
  sections now group by member account (new `groupRowsByMemberAccount`
  helper) whenever an institution has more than one — invisible/unchanged
  for every institution with 0 or 1. Bill rows also dim + label
  "Inactive" here now, matching the Bills screen's own new treatment
  (see below).
- `tsc --noEmit` clean, 223/223 tests pass. Next: `BillDialog`/`DebtDialog`
  (active toggle, member-account selector).

## 2026-09-16 — BillDialog/DebtDialog wiring; ADR-106 feature complete
Last section of the plan.
- `src/routes/app.bills.tsx`: `BillDialog` gains an "Active" `Switch`
  (exact copy of `AutoTransferDialog`'s existing pattern, wired to
  `is_active`) and a "Whose account" selector (only shown once the
  selected institution has member accounts — `institution_member_account_id`).
  Bill list rows now dim (`opacity-60`) + label "· Inactive" for
  `is_active === false`, matching the auto-transfer row precedent, plus a
  small "· {member}" chip when a member account is set.
- `src/routes/app.debts.tsx`: `DebtDialog` gains the same "Whose account"
  selector (debts have no active/inactive concept, per the interview —
  only bills do). Debt list rows get the same "· {member}" chip.
- Verified via the read-only MCP earlier and via `tsc`/`vitest` throughout
  — every section run individually, not batched. Final state: `tsc
  --noEmit` clean, 223/223 tests pass, `eslint` clean on every changed
  file (repo-wide CRLF/prettier noise and 2 small pre-existing issues in
  untouched code confirmed unrelated by running eslint against an
  untouched file for comparison).
- **ADR-106 is now fully implemented**: institution links (Bill Pay/
  Patient Portal/Other, Log In button prefers Bill Pay), per-member
  institution accounts (Bills/Debts can tag "whose account", grouped in
  the Institution detail view), institution parent/child with rollup
  totals + list decluttering, and the bill Active/Inactive toggle.
- **Not done this session** (explicitly out of scope, flagged for
  awareness): no live browser check — this sandbox can't reach the dev
  server (`npm run dev` on :8080), per the known environment constraint.
  Recommend a manual pass: add Bill Pay/Patient Portal links to a medical
  institution and confirm the Log In button; mark a bill inactive and
  confirm it drops out of paycheck/snapshot totals; set Prime's parent to
  Amazon and confirm the rollup + list decluttering; add 2 member
  accounts to Yukon Eye and confirm a tagged debt's owner chip + the
  Institution detail's grouped Bills/Debts sections.
