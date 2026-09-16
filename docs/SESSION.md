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
