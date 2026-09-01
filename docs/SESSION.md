## Session Notes

- 2026-08-27 — Phase 11 GitHub Milestone created ("Phase 11 — Ledger
  correctness, money movement, mobile polish", milestone #4) so the
  in-progress phase shows progress. 16 retroactive closed issues (#15–#30),
  one per completed workstream (ADR-055…087), all pointing at
  docs/CHANGELOG.md + docs/CONTEXT.md for detail. Open verification issues
  #4–#8 assigned to it; #9–#10 left unmilestoned (cross-cutting tech-debt).
  Currently 16 closed / 5 open (76%). GitHub-only change, no code.

- 2026-08-27 — Verified (3 Explore agents + live DB): the app never auto-creates
  a balance snapshot (manual "Save snapshot" on Accounts only), and nothing is
  written automatically on a calendar-month rollover — every cycle/arrears/​
  spending figure is derived at render. The only persistent freeze is
  `spending_actuals.is_manual_override` (manual cell edits). Plan approved to
  fix three rough edges the check surfaced (month-rollover-safety plan).

- 2026-08-27 — Fix 3 (copy only): `app.spending.tsx` "Start new month" toast no
  longer says "<month> locked in" ("Now budgeting <next> · earlier months stay
  editable"); override confirm dialog reworded to say the override is that-month-
  only and reversible via the pencil. ADR-041 addendum. No behaviour change.
  Files: src/routes/app.spending.tsx, docs/DECISIONS.md.

- 2026-08-27 — Fix 2 (PR): Dashboard "Past due" + `PastDueBadge` now use new
  `priorArrearsSummary()` (arrears from cycles before the current calendar month
  only) instead of `computeArrears().amountOverdue` — the current cycle also
  shows under "Still owed this period" (ADR-080), so counting it in both
  double-counted (up to ~2–3× for an item a month behind). `computeArrears`
  itself unchanged (still the payoff/repair figure + all payment math). Also
  added `arrearsWalkStart()`: a monthly debt's missed prior-month cycle no longer
  silently vanishes from arrears (one-month lookback; deeper misses need the
  ledger — docs/TODO.md). ADR-049 addendum + ADR-080 note. 94 tests (88 + 6).
  Files: src/lib/arrears.ts, src/components/PastDueBadge.tsx,
  src/routes/app.index.tsx, src/lib/arrears.test.ts, docs/*.

- 2026-08-27 — Fix 1 (PR, stacked on Fix 2): historical-month cycle inspection.
  `useCycleState(refDate?)` (default = today, all call sites unchanged). Shared
  `CycleMonthStepper` on Bills + Debts detail (monthly items only; non-monthly
  get a muted "not available" line). Stepping to a past month re-derives the
  panel's cycle state / window / month-scoped transaction list; `refDate ≠ today`
  hides Sync-stored-status, PayActions/ArrearsPaymentAction/SetAsideAction
  (replaced with a Correct/Reverse pointer), keeps Log-a-payment / adjustments /
  per-tx actions. **Bills detail brought to ADR-085 parity** (was showing raw
  `payment_status`; now derives, with a `stored:` line). Added a right-now
  "Still owed / Past due / Total owed" rollup to both panels. `monthLabel` +
  `formatWindow` lifted to `src/lib/format.ts` (3 local copies removed).
  ADR-085 addendum. Browser-verified (login via `.env.test`, both panels, month
  step, gating, non-monthly). tsc + build + 96 tests (94 + 2 new).
  Files: src/lib/ledger-state.ts, src/lib/format.ts,
  src/components/CycleMonthStepper.tsx, src/routes/app.debts.tsx,
  src/routes/app.bills.tsx, src/routes/app.spending.tsx,
  src/routes/app.spending-by-place.tsx, src/lib/ledger-state.test.ts, docs/*.

- 2026-08-27 — SCRATCHPAD "Things to work on" #3 (Advance debt bug) + #2
  (account/card number). ADR-056 addendum + ADR-021 addendum. No schema change.
  Browser-verified against the TEST household (login via `.env.test`, all test
  rows cleaned up); tsc + build + 96 tests green.
  #3 — `src/routes/app.debts.tsx` `DebtDialog`:
    * advance-type debts show **Remaining balance** + **Minimum payment**
      disabled with helper text; on create they seed 0/0, on edit the form
      omits `remaining_balance` / `minimum_payment` / `date_paid_off` from the
      UPDATE entirely — a stale detail snapshot can no longer clobber a live
      draw (the actual data-loss path on "Dave ExtraCash").
    * `isPaidOff()` now treats an advance as paid off only when `date_paid_off`
      is set (advances sit at $0 between draws); other debt types unchanged.
    * creating any debt with no starting AND no remaining balance no longer
      stamps `date_paid_off`.
    * blank interest rate / minimum payment now write `0` not `null` — both
      columns are NOT NULL, so a no-rate debt never saved before (pre-existing
      bug surfaced while testing the advance flow).
  #2 — "Account / card number" field added to `AccountDialog` bound to the
    existing `accounts.account_number` column; `src/routes/app.accounts.tsx`
    shows `···1234` after the account name; pickers/pills already used
    `accountLast4`/`accountLabel`.
  Files: src/routes/app.debts.tsx, src/components/AccountDialog.tsx,
  src/routes/app.accounts.tsx, docs/DECISIONS.md, docs/SCHEMA.md,
  docs/SCRATCHPAD.md. Issues: #37 (advance bug), #36 (ownership follow-up).
  - Known follow-up: SCRATCHPAD #1 / Issue #36 (account ownership "mine vs
    hers", exclude other member's accounts from spendable + net worth) —
    designed in the plan, not built. Needs new ADR-088 +
    `accounts.owner_member_id` migration.
  - Manual data fix pending (Steven, "Our Household"): restore "Dave ExtraCash"
    (`da042cbb-…`) to `remaining_balance`/`minimum_payment` = 50, `date_paid_off`
    = null. SQL in Issue #37 / the plan file.
  - Known cosmetic (not fixed): the debt-detail panel still shows an empty $0
    advance's cycle as "Cleared" (ADR-036/085 ledger-derived state); harmless,
    resolves once a draw is recorded.

- 2026-08-27 — SCRATCHPAD #1 / Issue #36: account ownership "mine vs hers"
  (ADR-088). Code written; **migration not yet run**, so not browser-tested.
    * `accounts.owner_member_id uuid null → household_members(id)` — null =
      joint. Also wires the pre-existing unused `accounts.include_in_net_worth`.
    * New `src/lib/household.ts`: `useHouseholdMembers()` + `useCurrentMember()`
      (mirrors `useMemberTheme`). New `accountInMemberView()` in `balances.ts`.
    * `AccountDialog`: "Belongs to" select (Joint / each member) + "Include in
      net worth" checkbox.
    * Scoped per-viewer: dashboard combined spendable + breakdown
      (`app.index.tsx`), net-worth total + trend (`net-worth.ts` also honors
      `include_in_net_worth`), Status Snapshot balance subtotals
      (`app.snapshot.tsx`). Ledger / per-account cards / institution totals
      unchanged.
    * Accounts screen: owner chip on each card + an "Owner" filter.
    * `docs/SCHEMA.md` "Never Add" rule amended.
  Files: src/lib/supabase.ts, src/lib/household.ts (new), src/lib/balances.ts,
  src/lib/net-worth.ts, src/components/AccountDialog.tsx, src/routes/app.index.tsx,
  src/routes/app.snapshot.tsx, src/routes/app.accounts.tsx, docs/*.
  - Migration run by Steven. Browser-verified in the TEST household (dashboard /
    accounts / snapshot load clean, "Belongs to" hidden for a 1-member
    household, "Include in net worth" round-trips). Owner-scoping (2-member)
    path covered by `src/lib/balances.test.ts` (5 new tests, 101 total).
    "Belongs to" marks the signed-in member "(me)". PR #39, Closes #36.
    Live 2-member check happens when it reaches "Our Household".

- 2026-08-27 — Issue #40: correcting one paycheck split collapsed the whole
  paycheck onto one account. ADR-047 addendum. No schema change.
    * Root cause: paycheck + deduction deposits share
      `split_group_id = income_event.id`; `TransactionDetail` routed **any**
      `split_group_id` row to `SplitTransactionDetail` (ADR-044 single-account
      category editor), which delete-all + re-inserts every line onto one
      account.
    * `src/lib/split-groups.ts`: `classifyLedgerGroup` /
      `isCategorySplitGroup` / `assertCategorySplitRows`. A genuine category
      split = id not an `income_events.id`, one `account_id`, no linked rows.
    * `src/routes/app.transactions.tsx`: only a category split opens
      `SplitTransactionDetail`; a paycheck / deduction / multi-account group is
      edited one deposit at a time via the normal single-row
      `TransactionDetail` + `useUpsertTransaction` (banner "…changes only this
      deposit"; category/place selects hidden; linked deduction deposits stay
      read-only). Ledger card relabelled "Paycheck · N deposits"; its breakdown
      rows are clickable.
    * `src/lib/data-hooks.ts`: `useSaveSplitTransaction` /
      `useDeleteSplitTransaction` hard-refuse multi-account / linked groups
      (`assertCategorySplitGroup`).
    * Tests: `src/lib/split-groups.test.ts` (11 new, 115 total).
    * Browser-verified in the TEST household (seeded a 3-account paycheck +
      a real category split): paycheck card shows "Paycheck · 3 deposits",
      editing one deposit's amount left the two siblings' accounts+amounts
      untouched; category split still opens the group editor. All test rows
      cleaned up.
  Files: src/lib/split-groups.ts, src/lib/split-groups.test.ts (new),
  src/lib/data-hooks.ts, src/routes/app.transactions.tsx, docs/DECISIONS.md.
  - Follow-up filed: Issue #41 "no safe way to un-receive a paycheck".
  - Manual data repair pending (Steven, "Our Household"): the 2026-08-27
    "ASRC Federal" paycheck (`split_group_id ca9ac780-…`) — 6 deposits to
    re-point off USAA Classic Checking, and `income_events.actual_amount`
    → 3159.37. SQL in the plan file / handed over.

- Budget split lines (Spending / Bills / Debts / Deducted) now carry a small
  receipt icon that jumps to Transactions pre-filtered to the tile's categories,
  the period date range, and linked (bill/debt payments) vs. unlinked (spending).
  Files: `src/components/BudgetSplitLines.tsx`, `src/lib/tx-filter-store.ts`,
  `src/routes/app.transactions.tsx` (multi-category + linked/date pre-filter),
  `src/routes/app.index.tsx`, `src/routes/app.spending.tsx`. UI-only, no schema
  change. Typecheck clean.

- Debt detail: "Total owed" is now capped at the debt's remaining_balance so past-due arrears can't roll the figure above what is actually outstanding (Alpine Medical - Steven showed $76 against a $38 balance). Presentation-only change in `src/routes/app.debts.tsx`; bills (no balance column) unchanged.

- Deduction-funded bills/debts (ADR-068 addendum) now derive as Cleared. The
  deduction posts a positive deposit into its destination account, which the
  ADR-036 signed netting treated as a refund, so TSP Loan / TSP Loan 2 /
  401k Loan 1 read UNPAID despite the 8/17 paycheck deduction. `deriveCycleInfo`
  now counts a funded payable's own `Deduction: …` deposit rows by magnitude;
  reversals keep signed behaviour. Derivation only — account credit and debt
  balance reduction were already correct, no schema or data change.
  Files: `src/lib/ledger-state.ts`, `src/lib/ledger-state.test.ts` (3 new tests,
  104 total, all green). Verified live: both TSP loans now derive `cleared`.

- Debts mobile fit fixes (`src/routes/app.debts.tsx`, UI-only): the Edit debt
  dialog had no height cap or scroll — it overflowed the viewport top/bottom
  with body scroll locked, leaving Esc as the only exit. It (plus the Add
  adjustment / Record advance dialogs) now uses the standard
  `max-h-[90vh] overflow-y-auto` constraint, and the edit footer is sticky so
  Save/Delete stay reachable. Detail dialog's Recent-transactions rows split
  into two lines (info+amount, then status + Delete/Correct/Reverse) so the
  action buttons no longer crowd off the right edge on phones. 115 tests green.

- Ledger: linked payments are now correctable from the Transactions screen
  (`src/routes/app.transactions.tsx`, UI-only). A bill/debt-linked row used to
  dead-end on "correct it from the bill/debt", but the bill/debt detail only
  exposes Correct/Reverse for a narrow eligibility window, so a wrong
  payment+fee split (e.g. Aarons - Dresser: -$14.26 fee + -$106.30 payment)
  had no reachable edit path. Transaction detail now renders the existing
  `CorrectPaymentButton` (ADR-077) and `ReversePaymentButton` (ADR-070) inline
  for linked rows in both view and edit mode; the fee row remains directly
  editable since it carries no link (ADR-046). Breakdown affordance for
  per-row groups now reads "tap a line to edit". No logic/schema change,
  115 tests green.
- ADR-088 — unified linked-transaction editing. `src/lib/payments.ts`:
  `fetchPayable`, `rollbackClearedPayment`, `useEditLinkedTransaction`
  (rollback-then-reapply, handles pending↔cleared and stale cycle tags).
  `src/lib/split-groups.ts`: new `payment-with-fees` classification +
  `isPaymentWithFeesGroup`. `src/routes/app.transactions.tsx`: linked rows now
  fully editable via the normal Edit button with payable-aware save, Reverse
  replaces Delete, and payment+fee groups open a new `LinkedGroupDetail`
  editor (edit payment + fees together, add/remove fee lines). Tests updated
  for the new classification; 117 green, build OK.
  User-visible: tap the Aarons - Dresser group → Edit → fix the payment amount
  and the fee line in one place; the debt follows along.
- Aaron's - Dresser lease alignment (data-only, no ADR — existing fields only).
  Read the live row + ledger: debt `8004b659…`, starting 2550.00 / remaining
  1855.06 / min 92.04 / due_day 21 / next_due 2026-08-18 / plan 24 payments,
  four cleared payments of -92.04 (04-23, 05-21, 07-21, 08-21) plus fee lines
  (Tax 5.06, Protection Plus 9.20, one 5.00 Non-Renewal; August's lone -14.26
  = 5.06 tax + 9.20 protection). None of that matched lease 33984278: $97.10/mo
  x 24 = $2,330.40 total cost to own, cash price $1,297.42.
  Wrote `scripts/migrations/2026-08-31-aarons-dresser-lease-alignment.sql`
  (user runs it in the Supabase SQL Editor): rolls the $5.06 tax into each of
  the four principal rows (92.04 → 97.10) and strips the matching tax fee rows
  so account cash-out is unchanged; restates the debt to starting 2330.40 /
  remaining 1942.00 (20 payments left) / min 97.10 / due 2026-09-21 /
  cycle_paid_to_date 0 / status unpaid / interest 0 / lease details in notes.
  Protection Plus stays a fee line (ADR-046) — it isn't part of the 24 payments.
  Known issue: the pre-existing 2550.00 → 1855.06 balance couldn't be explained
  by the four logged payments (368.16); the restatement overwrites it rather
  than reconciling the earlier drift.
- ADR-089: fixed Monthly Summary drill-down returning an empty transaction list
  (the date range was built from a `YYYY-MM-01` month key as `...-01`/`...-31`,
  so no date could match) and stopped counting two-sided transfers as spending.
  New `src/lib/internal-transfers.ts` (`internalTransferIds`,
  `isInternalTransfer`) is used by `monthly-summary.ts` and
  `spending-actuals.ts`; drill-downs pass `excludeInternalTransfers` through
  `tx-filter-store.ts` so the Transactions list matches the figure tapped.
  Files: `src/lib/internal-transfers.ts` (+test), `src/lib/monthly-summary.ts`,
  `src/lib/spending-actuals.ts`, `src/lib/tx-filter-store.ts`,
  `src/components/BudgetSplitLines.tsx`, `src/routes/app.transactions.tsx`,
  `src/routes/app.index.tsx`, `src/routes/app.spending.tsx`. 120 tests green.
  User-visible: Savings' inflated $1,710.34 drops to any genuinely one-sided
  transfer leg, and the receipt icon now lists the rows behind the number.
- ADR-090: reconciled Fix Places with Spending by Place. Fix Places no longer
  skips split lines or one-sided transfer legs (only internal two-sided
  transfers are excluded, ADR-089) and labels split rows "part of a split";
  Spending by Place excludes internal transfers from its rankings and its
  untagged footnote, which now links to Fix Places with a row count.
  Files: `src/routes/app.fix-places.tsx`, `src/routes/app.spending-by-place.tsx`.
  User-visible: the August "$14,238.72 has no place attached" note drops to the
  ~$1,716 that is actually assignable, and tapping it opens those rows.
- Fix Places rows now show context: derived title (description → linked bill/debt → category → parent split line), category + linked payable line, and a split/transfer sibling breakdown with group total, line amounts, and each sibling's assigned place. Files: src/routes/app.fix-places.tsx. ADR-090.
- Everything screen rework: added paid-status, due-this-pay-period and
  due-this-month filters, multi-select category filter, A–Z sort, and grouping
  by category / bill vs debt / paid status / pay period / month (group headers
  show count + summed amount). Rows now tap through to the same Bill/Debt
  detail dialogs used on those screens (exported from their routes, edit wired
  through), show an emoji instead of the "Bill"/"Debt" word, lead with the due
  date, and render cycle + category as fixed-width aligned chips. Pay-period
  derivation moved to the shared `src/lib/pay-period.ts` (`currentPayPeriod`,
  `payPeriodForDate`, `dueInPeriod`, `currentMonthWindow`) and `app.debts.tsx`
  now uses it. Files: `src/lib/pay-period.ts`, `src/routes/app.everything.tsx`,
  `src/routes/app.bills.tsx`, `src/routes/app.debts.tsx`. 120 tests green.
- Everything row polish + debt category editing: the debt edit dialog now has a
  Category picker (sits above Institution, writes `category_id`) — previously
  debts had no way to set a category anywhere in the app. On the Everything
  rows, the linked institution's logo renders as a 10%-opacity decorative
  watermark behind the title (skipped when there's no institution or logo), and
  the Unpaid/Pending/Cleared chip is gone (the circular state icon already says
  it) — replaced by a red "Overdue" chip shown when the due date has passed and
  the item isn't cleared. Files: `src/routes/app.debts.tsx`,
  `src/routes/app.everything.tsx`.
- Everything row refinements (UI-only): the institution watermark is now 18%
  opacity and horizontally aligned with the item title (after the emoji/due-date
  prefix) instead of the left edge of the row. The "Overdue" chip moved down to
  the cycle/category chip row so all three status pills line up. Cycle chips are
  now capitalized, and `one_time` displays as "Invoice". File:
  `src/routes/app.everything.tsx`.
- Everything row refinements v2 (UI-only): watermark bumped to 20% opacity.
  "Overdue" chip returned to the title line and pushed to the right with
  `ml-auto`. Category chips now use the category's stored `color` as a tinted
  background/border and show the stored `icon` emoji. File:
  `src/routes/app.everything.tsx`.
- Everything row refinements v3 (UI-only): category reduced to its emoji only,
  rendered in a coloured chip directly below the bill/debt kind emoji. Institution
  watermark bumped to 25% opacity. Amount moved into a fixed-width right
  column so the title area has a constant width and the "Overdue" chips line up
  vertically. File: `src/routes/app.everything.tsx`.
- Everything row refinements v4 (UI-only): category emoji chip enlarged from
  `h-5 w-5` to `h-6 w-6` (`text-xs`). File: `src/routes/app.everything.tsx`.




