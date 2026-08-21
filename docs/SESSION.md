## Session Notes

- ADR-075: user ran the `resolved_cycle_due_date` migration in the Supabase
  SQL Editor. Verified live via the read-only MCP (`list_tables`) —
  `public.transactions.resolved_cycle_due_date` exists (nullable date). The
  fix is now fully active going forward. Updated ADR-075's status line,
  removed the now-done TODO item, and dropped "pending" from CONTEXT.md's
  Phase 11 bullet.
  - Next step: smoke-test — pay a bill one day late and confirm the next
    cycle shows Submit, not Reset.

- Reviewed docs/TODO.md and docs/SCRATCHPAD.md's "Things to work on" against
  current code before touching anything: several items were already fixed in
  earlier sessions (Dashboard Budget vs Actual scope/label/tooltip, Monthly
  Summary subheader, debt payment date field, Add Transaction auto-labeling)
  and needed no work. Live-checked MoneyLion Instacash/OnePay Advance via the
  read-only MCP for the ADR-066 report — found a real `minimum_payment` vs
  `remaining_balance` desync on both, but traced it to stale pre-ADR-056-
  addendum data (rows untouched since before that fix), not a current code
  bug — gave the user a one-time SQL fix rather than changing code.

- Implemented ADR-076 (arrears-only payments) and ADR-077 ("Correct this
  payment"), both approved after a scoping interview. No schema changes —
  both reuse existing columns.
  - ADR-076: `priorCyclesArrears()`/`arrearsPaymentTag()` (arrears.ts) —
    arrears owed strictly before the current cycle, and the ADR-075 tag to
    exclude an arrears-only transaction from the current cycle's ledger
    window. `applyArrearsPayment`/`useMarkArrearsPaid` (payments.ts) + new
    `ArrearsPaymentAction.tsx`, wired into `PayActions.tsx` so "Log arrears
    payment" shows up everywhere Submit/Reset already does, hidden when
    nothing's owed from before the current cycle. Generalized
    `applyClearedPayment`'s overflow-into-arrears reduction (bills and
    debts) to use `priorArrears` instead of raw `opening_arrears`, removing
    the `opening_arrears > 0` gate that silently no-oped whenever arrears
    came purely from the live missed-cycle walk — this also fixes "Total
    due" overstating what's owed (pay-flow.tsx's preset used the same fixed
    formula). `applyClearedPayment`/`useMarkCleared`/`PayInput` all gained a
    `priorArrears` parameter, computed by the caller (payments.ts can't
    import arrears.ts — arrears.ts already imports from payments.ts); updated
    all 4 call sites (pay-flow.tsx, AddTransactionFab.tsx,
    deduction-funding.ts, app.pending.tsx).
  - ADR-077: `useCorrectPayment` (payments.ts) — edits a cleared, linked
    PARTIAL payment's amount/date/account in place via a `cycle_paid_to_date`
    delta; rejects anything that would cross a resolve boundary either
    direction, pointing at Reverse instead (v1 scope, per user decision). New
    `CorrectPaymentButton.tsx`, wired in next to Reverse/Delete on Bills' and
    Debts' Recent Transactions. `StrandedBillRepair`/`StrandedDebtRepair`
    gained a "Credit now" action alongside "Clean up" — applies a stranded
    group's already-cleared total via `applyClearedPayment` instead of
    deleting the rows and asking for a redo.
  - Also fixed, while in this code: `computeArrears()` (arrears.ts) now
    trusts a monthly debt's `payment_status='cleared'` for its current cycle
    ONLY when `updated_at` is recent enough to plausibly be for that cycle
    (bounded via `shiftDateSafe`) — closes the "cleared but still shows 1
    cycle past due" gap without risking a stale flag hiding a genuinely
    overdue debt. Fixed a test-fixture bug in `arrears.test.ts`'s ADR-057
    test (an `arrears_as_of` value that couldn't produce the scenario the
    test's own comment described — the code was correct, the fixture wasn't).
    Added regression tests for `priorCyclesArrears`, `arrearsPaymentTag`, and
    the monthly payment_status fix.
  - Cleared resolved items out of docs/SCRATCHPAD.md's "Things to work on"
    and the three "## Idea" sections that became ADR-075/076.
  - Next step: draft and hand off the (now small) Lovable prompt — run the
    test suite, then smoke-test everything listed in TODO.md's "Follow-up
    work" section. Build/tests unverified locally (AppLocker).

- QA pass task 1 (2026-08-21): ran the full test suite in the Lovable
  sandbox. `src/lib/arrears.test.ts` 13/13 pass, `src/lib/ledger-state.test.ts`
  10/10 pass (23 tests, 2 files — the only test files in the repo). Build
  reports OK. No failures, no fixes required.
  - Known issue (pre-existing, non-blocking, surfaced in typecheck output):
    `src/lib/monthly-summary.ts:79` and `src/lib/paycheck-budget.ts:281`
    both report TS2871 "This expression is always nullish". Not a
    regression from the ADR-075/076/077 work; logged for a later cleanup.
  - Tasks 2-8 are live smoke tests and are blocked pending a throwaway
    household login — the sandbox cannot mint a session for the
    self-managed Supabase project.

- QA pass tasks 2-8 (2026-08-21): smoke-tested against the live household in
  the Lovable sandbox (headless browser, throwaway test login). Results:
  - Task 2 PASS — Bill detail's Recent Transactions rows show the account
    icon + name; tapping a row opens the transaction detail dialog.
  - Task 3 PASS — stranded panel listed the seeded payment; "Credit now"
    rolled the bill's cycle, the panel cleared, and the original transaction
    survived (not deleted).
  - Task 4 PASS (ADR-075) — bill paid one day after its due date rolled to
    the next cycle showing "Submit payment", not "Reset this cycle".
  - Task 5 FIXED then PASS (ADR-076) — `arrearsPaymentTag()` returned the
    CURRENT due date whenever the current cycle was itself overdue (the
    arrears walk's first iteration reports it as `oldestMissedDate`), and
    `deriveCycleInfo` keeps transactions tagged `>= dueDate`. So an arrears
    payment read as a partial payment of the current cycle and also tripped
    the stranded-payment panel. `arrears.ts` now forces the tag strictly
    before the current due date (falls back one cycle via `shiftDateSafe`);
    regression test added in `arrears.test.ts` (24 tests green). Re-verified
    live: the button only appears with prior arrears, the current cycle stays
    "Unpaid · $100.00 left", and two differently-dated payments applied
    cleanly ($300 -> $150 -> $125 past due).
    - Known issue (NOT fixed — needs an ADR decision, see TODO): the FIRST
      arrears payment on a payable whose current cycle is also overdue drops
      the current cycle's own amount from the past-due total ($300 - $50 paid
      showed $150, not $250). Cause: `applyArrearsPayment` sets
      `arrears_as_of = today`, and `computeArrears`' as-of cutoff suppresses a
      PREFIX of the cycle walk — and the current cycle is the oldest entry in
      that walk — while `opening_arrears` only carries the *later* missed
      cycles. Subsequent payments are correct. Cannot be fixed without
      changing the ADR-049 as-of/opening_arrears representation.
  - Task 6 PASS — pay dialog on an already-overdue cycle offers
    "Total due (+ $125.00 arrears) · $225.00" (= $100 cycle + $125 arrears),
    taps cleanly and advances to the account step.
  - Task 7 PASS (ADR-077) — pencil edited a $20 cleared partial to $35;
    debt went to `cycle_paid_to_date` 35 / remaining 985 (correct reverse+
    reapply). Pencil is absent, not erroring, on a cycle-resolving payment.
  - Task 8 PASS (ADR-066), does NOT reproduce — recording a $50 advance
    against a $0/hidden advance debt cleared `date_paid_off` and the debt
    reappeared in the default (paid-off-hidden) list at $50 remaining.
    - Cosmetic nit: the reactivated row still shows the stale "Cleared" chip
      and "88% paid off" until the next status write. Logged, not fixed.
  - Files touched: `src/lib/arrears.ts`, `src/lib/arrears.test.ts`.

- Reviewed Lovable's QA-pass fix to `arrearsPaymentTag()` (`173c7ef`): the
  behavioral fix is correct, but found and removed a genuinely dead branch —
  `computeArrears`'s walk always starts AT the payable's current due date, so
  `oldestMissedDate` (when set) is always >= that date, never before it, so
  the "return oldestMissedDate directly" branch could never execute. Also
  fixed a test whose assertion passed but for the wrong reason (exercised the
  fallback path, not what its name/comment claimed). No behavior change.

- Implemented ADR-078 (`arrears_paid_to_date` running counter), approved
  after diagnosing the QA-logged gap: a "Log arrears payment" on a payable
  whose current cycle was itself overdue dropped that cycle's own amount
  from the past-due total, because ADR-076 routed arrears credit through
  `opening_arrears`/`arrears_as_of` — a mechanism that can only suppress a
  PREFIX of the missed-cycle walk, the wrong shape for what ADR-076
  consolidates (everything except the walk's first/current entry).
  - Caught a bug in my own drafted ADR-078 mid-implementation before writing
    any code: the ADR's reset clause ("reset to 0 wherever cycle_paid_to_date
    resets") would have wiped the counter on literally every normal cycle
    resolve, discarding legitimate arrears credit almost immediately. Traced
    the actual math instead of the intuition it was written from — a normal
    resolve only ever shrinks the raw walk by the current cycle's own
    amount, always covered by `cycle_paid_to_date`, never overlapping with
    what the counter tracks — so no reset is needed at all. Corrected the
    ADR text in DECISIONS.md before implementing (documented the wrong
    version too, so the reasoning is preserved).
  - `computeArrears` (arrears.ts) now subtracts `arrears_paid_to_date` from
    the always-fresh raw total (`openingArrears + missedAmount`), floored at
    0; `opening_arrears`/`arrears_as_of` are back to ADR-049's original
    meaning only. `applyArrearsPayment` and `applyClearedPayment`'s
    overflow-into-arrears branches (bills and debts) now increment the
    counter instead of writing `opening_arrears`/`arrears_as_of`.
  - Added regression tests: the exact QA-reported scenario ($300 raw, $50
    paid → $250 not $150), a two-state test proving the no-reset design
    stays correct across a normal resolve, the floor-at-0 case, and the
    paid-off-debt carry-in case.
  - No schema change to bills/debts.opening_arrears/arrears_as_of — new
    column `arrears_paid_to_date` (nullable numeric, default 0) on both
    tables. SQL migration given to the user, not yet run.
  - Known limitation, documented in the ADR, not fixed (pre-existing
    ADR-076 scope, unrelated to this bug): `applyArrearsPayment` never
    touches `cycle_paid_to_date`, so a cycle paid off in advance via an
    arrears payment still shows "Unpaid"/offers Submit once its own due date
    becomes current — paying it there too would double-pay it.
  - Next step: user runs the SQL migration, then smoke-tests the exact QA
    scenario (partial arrears payment on an also-overdue current cycle).

- Diagnosed the real Beiers bill (not the seeded test fixture): "Credit now"
  rejected the actual $108.39 cleared payment. Root cause via the read-only
  MCP: `cycle_amount_due` was null (falls back to bare `bill.amount`=$88.39,
  missing an active $20 late-fee `bill_adjustments` row that WAS correctly
  applied when added — `useAddBillAdjustment` does set `cycle_amount_due`
  right) and `next_due_date` had drifted to 2026-09-01 instead of the
  still-open 2026-08-01. Found the likely cause: `useResetCycle`/
  `useMarkUnpaid` write `cycle_amount_due: null` unconditionally, with no
  awareness of active adjustments — logged as a real, unfixed bug in TODO.md
  (separate from anything built this session). Gave the user a one-time SQL
  fix for the two fields; no code changed for this item.
  - Also found while investigating: `bills`/`debts.updated_at` has no DB
    trigger and no app code path sets it on UPDATE — frozen at insert time
    forever. Undermines `findStrandedBillPayments`/`findStrandedDebtPayments`'s
    dedup guard and `computeArrears`'s monthly `clearedRecently` check (both
    fail closed, not unsafe, just non-functional). Became ADR-079.

- Implemented ADR-079 (`set_updated_at()` trigger on `bills`/`debts`), user-
  approved. Pure DB trigger, no app code changes — the existing checks
  already read `updated_at`, they'll just start seeing real values once the
  trigger exists. SQL migration given to the user, not yet run.

- All three pending SQL migrations (ADR-078, ADR-079, the one-time Beiers
  fix) confirmed run and verified live via the read-only MCP. Beiers'
  "Credit now" click was confirmed to have succeeded (transaction tagged
  `resolved_cycle_due_date=2026-08-01`, bill correctly rolled to 9/1) —
  cleared the stranded panel.

- Walked the user through the same `cycle_amount_due=null` root cause on two
  more bills (Prose: $59.18 base vs $125.54 actually charged; ATT: $212.33
  vs $256.38) — same one-time SQL pattern each time (set `cycle_amount_due`
  to match the real cleared amount, then click "Credit now"). No code
  changes for these two; genuinely just missing adjustment/overage data,
  same as Beiers.

- Found and fixed a real bug in "Credit now" while working through the Rent
  (via Flex) bill: `StrandedBillRepair`/`StrandedDebtRepair`'s `credit`
  mutation passed the group's full `clearedSum` (every cleared transaction
  in the bill's current ledger window) to `applyClearedPayment`, which
  treats its amount as NEW money layered on top of `cycle_paid_to_date` —
  double-crediting whatever portion of that window was already correctly
  credited. Only surfaced now because Rent was the first case with a
  PARTIALLY-credited window ($1,250 of $1,700 already correct, one more
  $450 transaction stranded) — every earlier case (Beiers, Prose, ATT) had
  `cycle_paid_to_date=0`, where the bug is invisible (full sum == the delta).
  Fixed both repair panels to credit `clearedSum - cycle_paid_to_date`
  instead. Debts can't currently hit this (`findStrandedDebtPayments`
  requires `cycle_paid_to_date === 0` to flag at all), fixed there too for
  consistency in case that condition ever loosens.
  - Gave the user a direct SQL fix for Rent (bypasses the not-yet-deployed
    code fix): resolves the August cycle correctly (only $450 was actually
    missing) and tags all 5 of Rent's untagged cleared transactions,
    including two from July that predate the current window and were
    already effectively resolved.
  - Files touched: `src/components/StrandedBillRepair.tsx`,
    `src/components/StrandedDebtRepair.tsx`. No schema change.
  - Next step: once redeployed, worth a broader sweep — a SQL scan this
    session found ~15+ bills household-wide with untagged cleared
    transactions never credited to `cycle_paid_to_date` (most with
    `cycle_paid_to_date=0`, where "Credit now" should already work
    correctly as-is; not yet individually verified).

- ATT and Rent fixed the same way as Beiers/Prose (ATT: `cycle_amount_due`
  SQL fix + "Credit now"; Rent: direct SQL since it hit the double-credit
  bug above, code fix not yet deployed). Both confirmed cleared from the
  Stranded panel by the user.

- Corrected the "~15+ bills" sweep from earlier: user reports none of them
  show in the Stranded panel. Re-traced several by hand against the real
  `findStrandedBillPayments()` window logic (not the rough SQL scan I used
  originally) and confirmed they're genuinely excluded — their transaction
  dates fall on/before the current cycle window's own start boundary, so
  the app correctly treats them as already-superseded, not stranded. The
  SQL scan was a false-positive-prone heuristic, not a bug; corrected
  TODO.md rather than leaving the user chasing it further. One possible
  exception flagged for a real check: SoFi-Invest, whose transaction (7/29)
  traces as falling just inside the current window, unlike the others.

- SoFi-Invest resolved and confirmed live via the read-only MCP: duplicate
  $5 debit deleted, remaining debit converted into a real transfer pair
  (paired +$5 credit into Robo via a shared `transfer_group_id`,
  `linked_bill_id` cleared), SoFi-Invest bill row deleted. Removed the
  now-closed item from TODO.md.

- Implemented ADR-080: Dashboard's "Still owed this period" was silently
  dropping overdue bills/debts (they only appeared in the separate "Past
  due" section, driven by different logic). Fixed at the shared
  `obligationsInRange()`/`deductedObligationsInRange()` level
  (`paycheck-budget.ts`) per user's own scoping answer, so Paycheck
  Budget's "Due this period" gets the same fix automatically. New
  `isDueOrOverdueInPeriod()` helper: includes an item when its due date is
  inside `[start, end)` OR when it's before `start` but the period hasn't
  fully elapsed yet (`end > today`) — overdue items now show at their
  normal per-cycle amount every period until actually paid, per the user's
  explicit "every period until paid" choice. Added an optional `today`
  param (defaults to a new `todayISO()` helper) to both functions; all 3
  existing call sites (`app.index.tsx`, `app.paycheck.tsx`, `snapshot.ts`)
  pass ≤5 positional args so the default applies untouched, no caller
  changes needed. No schema change.
  - Files touched: `src/lib/paycheck-budget.ts`.
- Added status icons to Paycheck Budget's "Due this period" rows (second
  half of the same user request): green check (cleared), timer (pending),
  exclamation (partial), only when the selected period covers today
  (`isCurrentPeriod` check in `PeriodBudget`) — a future period's bills
  can't have been paid yet and a past period's already moved on. No icon
  for plain unpaid or for projected rows (no real ledger cycle to check).
  Reused the existing ADR-036 `deriveCycleInfo()`/`LedgerState` machinery
  (same one Bills/Debts/Everything already use for Submit/Reset state)
  rather than inventing a new status computation — new
  `ObligationStatusIcon` component only picks different icons/copy for the
  same 4 states. Pending/partial icons are tap targets (Popover, same
  pattern as `HelpButton`) showing the amount pending or the
  paid/remaining split, per the user's "icon itself is the tooltip" ask.
  - Files touched: `src/routes/app.paycheck.tsx` (new
    `ObligationStatusIcon`, `ObligationRow` gained a `status` prop,
    `PeriodBudget` computes `isCurrentPeriod`/`obligationStatus`),
    `src/lib/paycheck-budget.ts` (exported the existing `todayISO()`
    helper for reuse instead of duplicating it). No schema change.
  - Not done: Dashboard has no equivalent per-row list to attach icons to
    ("Still owed this period" is category-grouped, not itemized) — user
    only asked for this on Paycheck Budget, so left as-is.
  - Next step: none open on this request — build unverified locally
    (AppLocker, per CLAUDE.md); worth a quick look at both pieces (overdue
    inclusion + status icons) live before considering this fully closed.
  - User tested live 2026-08-21: both pieces confirmed working correctly.

- Fixed a typecheck error that was breaking the dev preview with an HTTP 500:
  `src/routes/app.paycheck.tsx` had both an import of `todayISO` from
  `@/lib/paycheck-budget` and a local function with the same name (TS2440).
  Removed the duplicate local declaration; preview now serves 307/200 again.
  - Files touched: `src/routes/app.paycheck.tsx`.

- Accounts & Balances' "Recent activity" list (`RecentActivity` in
  app.accounts.tsx) had no visual marker for transfer legs, and the shared
  `TransactionDetail` dialog only ever showed one "Account" field (whichever
  side the row itself was), even for a transfer. Fixed by reusing existing
  patterns rather than inventing new ones:
  - Added the same `Badge variant="outline">Transfer</Badge>` that
    app.transactions.tsx's own list already shows per-row
    (`t.transfer_group_id`) to Accounts' Recent Activity rows too.
  - `TransactionDetail` (shared by both screens) now looks up the other leg
    by `transfer_group_id` and, when found, replaces the single "Account"
    field with "From"/"To" fields — sign of `amount` decides which (ADR-056:
    negative = from-account, positive = to-account) — plus a "Transfer"
    badge next to the Status badge. Non-transfer rows unaffected (still show
    plain "Account").
  - Files touched: `src/routes/app.accounts.tsx`,
    `src/routes/app.transactions.tsx`. No schema change, no ADR (pure reuse
    of the existing transfer_group_id/badge convention, not a new decision).
  - Next step: none open — build unverified locally (AppLocker).

- Found and fixed a real timezone off-by-one bug, reported by the user as
  Accounts' Recent Activity showing a transaction dated 8/15 as the 14th
  (detail dialog showed 8/15 correctly, since it renders the raw date
  string rather than parsing it). Root cause: `new Date("2026-08-15")`
  parses a date-only string as UTC midnight; in any timezone behind UTC,
  formatting that instant with local getters reads back as the prior local
  day. Same root cause was live in 4 places, 2 display-only and 2 that
  silently affect real numbers (not just what the user reported):
  - Display-only (swapped `new Date(x)` for date-fns' `parseISO(x)`, which
    parses in local time): Recent Activity's date (`app.accounts.tsx`,
    the reported bug), the account balance snapshot's "as of" date
    (`app.accounts.tsx`), and Debt detail's "Date paid off"
    (`app.debts.tsx`).
  - Real bug, not just display: `monthly-summary.ts`'s
    `combinedActualByCategory()` and `spending-actuals.ts`'s
    `buildActualResolver()` both built a month bucket via
    `monthKey(new Date(t.transaction_date))` — a transaction dated the 1st
    of a month could silently bucket into the PREVIOUS month's actuals
    (Monthly Summary card, Spending screen's per-category actual/history).
    Fixed by slicing the stored date string directly
    (`` `${t.transaction_date.slice(0,7)}-01` ``) instead of routing
    through `new Date()` at all — matches the string-slicing convention
    already used everywhere else in the codebase for date-only comparisons
    (`inRange()`, `deriveCycleInfo()`'s `day()`, etc.), and sidesteps the
    parsing question entirely rather than trading one Date-parsing bug for
    another. Removed spending-actuals.ts's now-unused `monthKey` import.
  - No other unsafe `new Date(someDateString)` call sites found in `src` —
    every other `new Date(...)` either takes no argument or already builds
    from explicit `(year, month, day)` components, which is timezone-safe.
  - Files touched: `src/routes/app.accounts.tsx`, `src/routes/app.debts.tsx`,
    `src/lib/monthly-summary.ts`, `src/lib/spending-actuals.ts`. No schema
    change, no ADR (bug fix, not a new decision).
  - Next step: none open — build unverified locally (AppLocker). Worth
    confirming live that a transaction dated on the 1st of a month now
    shows up in that month's Monthly Summary / Spending actuals, since that
    half of the bug had no visible symptom before now (only silently wrong
    totals) and wasn't part of what the user originally reported.

- Account "Type" field was free text; user asked for a dropdown. Converted
  `AccountDialog`'s Type input to a `Select`, same pattern as
  `InstitutionDialog`'s existing Type dropdown (fixed list, no free-text
  escape hatch — matches the "no schema constraint, UI list only"
  convention already used for institution_type). Queried live
  `account_type` values via the read-only MCP before picking the list, so
  it wouldn't invent labels that don't match real data — found the live
  set is `checking`/`savings`/`credit`/`invest`/`retirement`/`hsa`/`lpfsa`,
  not `investment` as `visual-meta.ts`'s icon map assumed. New
  `ACCOUNT_TYPES` constant (`AccountDialog.tsx`) uses the real values, plus
  `cash` (already iconned, no live accounts yet) and `other` as catch-all.
  - Fixed a latent (harmless but real) icon-mapping bug while in this
    code: `visual-meta.ts`'s `ACCOUNT_TYPE_META` keyed on `investment`,
    which never matched any live account (`invest` is what's actually
    stored) — every invest/hsa/lpfsa account has been rendering the
    generic 🏦 fallback icon instead of its own. Renamed the key to
    `invest`, added `hsa`/`lpfsa` entries. Also corrected the same
    `investment` → `invest` mismatch in `balances.ts`'s `EXCLUDED_TYPES`
    (added `hsa`/`lpfsa` too — harmless today since `SPENDABLE_TYPES`'
    allowlist already excludes them regardless, but now accurate) and
    `snapshot.ts`'s `BALANCE_TYPE_ORDER` (cosmetic subtotal ordering in
    the exported report).
  - Files touched: `src/components/AccountDialog.tsx`,
    `src/lib/visual-meta.ts`, `src/lib/balances.ts`, `src/lib/snapshot.ts`.
    No schema change (account_type was always free text, still is — just
    a fixed list in the UI, same as institution_type), no ADR.
  - Next step: none — build unverified locally (AppLocker).
