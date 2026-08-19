# Open items

## Pending manual SQL (Supabase SQL Editor)

- [x] ADR-028: `alter table households add column export_format text not null default 'png' check (export_format in ('png','pdf'));`
- [x] ADR-065 backfill (script, not a migration file): set `institution_id` on existing bill/debt payment and paired fee transactions where null, from the linked bill/debt. Until run, older payments keep appearing in Fix Places.
- [x] ADR-069: extend `categories.domain` to allow `'income'` and insert the four income categories (Income, Credit, Refund, Gift). Until run, Add Transaction's Income mode shows an empty category list.
- [x] ADR-072: `alter table pay_period_allocations add column if not exists fee_amount numeric(12,2);` then `notify pgrst, 'reload schema';`. Until run, saving a Fee amount on "Plan a payment" will fail — the app-side write already sends `fee_amount`.

## Verification

- [x] ADR-066: re-advance a paid-off advance-type debt (e.g. MoneyLion Instacash) and confirm it drops `date_paid_off`, reactivates and un-hides — same debt id, no duplicate row. Also confirm the Type picker saves "credit card" without tripping the check constraint. **STILL HIDES.** Note: `useCreateAdvance` was touched again 2026-08-19 (minimum_payment/next_due_date sync, unrelated to this bug) — re-check against current code before diagnosing.
- [x] ADR-056 addendum (2026-08-19): record a real advance against a biweekly `debt_type='advance'` debt with no due date yet (e.g. EarnIn) and confirm minimum payment, still owed this cycle, remaining balance, and next due date all populate correctly — minimum payment should equal remaining balance, next due date should land on the household's actual next paycheck. Also re-test the original reported case: if remaining_balance still doesn't update after this fix, that points to something beyond the write-path bug found here (data/live-only issue) and needs a live Supabase check, not another code read.
- [x] ADR-068: mark a paycheck received with a deduction that funds a bill/debt; confirm the current cycle settles, the deposit transaction is linked, and mismatch / already-paid cases log `deduction_payment_events` rows.
- [x] ADR-070: reverse a cleared bill payment and a cleared debt payment; confirm cycle paid-to-date, payment status, remaining balance and `date_paid_off` all roll back and the offsetting transaction appears.
- [x] ADR-069: after the migration, confirm Income mode saves a positive transaction with an income category and that income categories never appear in budget grids or the budget category picker.
- [x] ADR-071 (2026-08-19): plan a payment for a bill/debt that's also due-date-matched in "Due this period" for the same pay period, and confirm "Obligations total" / Left-to-allocate only count it once (via the Planned amount), while the "Due this period" line item itself is still shown at its full due-date amount, unchanged.
- [x] Work through Fix Places once the ADR-065 backfill has run, to confirm only genuinely place-less transactions remain.
- [x] ADR-072: after the migration, plan a bill/debt payment with a Fee amount and confirm the Planned row shows "$total ($base + $fee fee)"; confirm a plan with no fee still shows just the plain total.

## Dashboard / Paycheck Budget UX pass (2026-08-19, scoped from SCRATCHPAD.md)

Interviewed and scoped 2026-08-19 — decisions baked into the checkpoints below so
work can resume from here after any interruption. Sequenced quick wins first, then
the two bigger builds. No screenshots needed — build from code structure, review
in-app after.

### Phase 1 — quick wins

- [x] **Fix Places / transfers** (2026-08-19): `unassigned` in
  `app.fix-places.tsx` now filters out any transaction with `transfer_group_id`
  OR `split_group_id` set, alongside the existing `!institution_id` check —
  excludes transfers, paycheck deposits, splits, and deductions (ADR-047/055/
  056), matching the decision to exclude all structurally-placeless
  transactions, not just transfers. No schema change.
- [x] **Dashboard hero relabel + tooltips** (2026-08-19, `app.index.tsx:403-462`):
  - Relabeled "$X set aside this {period.label}" → "$X due this {period.label}".
  - Added a tooltip to "Combined spendable" (previously had none): checking +
    credit-account spendable contribution only, credit adds unused limit not
    balance, savings/investment/retirement always excluded.
  - Split the one combined tooltip into two — "due this {period.label}" and
    "debt to go" are now separate spans, each with its own `HelpButton`, and
    the "due" copy explicitly cross-references "Still owed this
    {period.label}" as the netted figure.
  - Added tooltips to the "Bills this {period.label}" / "Debts this
    {period.label}" tile labels: gross due-date totals, not netted against
    partial payments already made this period.
- [x] **Dashboard → Paycheck Budget button** (2026-08-19): `AppHeader` gained
  an optional `action?: ReactNode` prop (`AppHeader.tsx`), rendered next to
  the sign-out button — no other caller passes it, so every other screen is
  unaffected. Dashboard passes a `CalendarClock` icon-button linking to
  `/app/paycheck`. Also added a full-width `Card` link (same route) right
  under the hero, before "Spendable breakdown" (`app.index.tsx:488-501`).
- [x] **Past Due Deduction/HSA collapsible** (2026-08-19): added
  `overdueDeductionsOpen` state (`app.index.tsx`, defaults collapsed, same
  pattern as `payoffOpen`) and a chevron toggle button on the "Paycheck / HSA
  deduction" group header, which now also shows the item count and subtotal
  so the collapsed state stays informative. The "Other" group is unaffected —
  always visible, not collapsible (only the deduction/HSA subgroup was
  in scope). Payoff Progress's position/collapsibility were already correct,
  confirmed via code read — no action needed there.
- [x] **Aurora Audiology bug — diagnosed 2026-08-19.** Root cause confirmed live:
  debt `c20ab102-4462-4ac6-8571-04559c301db6`, `remaining_balance = 0.00`,
  `payment_status = 'cleared'`, `date_paid_off = null`. Two inconsistent
  "paid off" definitions exist in the codebase: the Debts screen
  (`app.debts.tsx:149`, `isPaidOff = remaining_balance <= 0`) vs.
  `obligationsInRange()`/`debt-payoff.ts:40`/`balances.ts:175`/`snapshot.ts:72`
  (all key off `date_paid_off` only). `date_paid_off` auto-sets in exactly one
  place — `applyClearedPayment()` (`payments.ts:150`), when a real payment
  zeroes the balance. The Debt edit form's save (`app.debts.tsx:690-713`,
  `remaining_balance` written raw from the input) has no equivalent logic, so
  a manual balance correction to $0 leaves `date_paid_off` null forever and
  the debt keeps generating future obligations everywhere except the Debts
  screen. Decision: backfill + guard the edit form (not the broader
  unify-all-checks option). Remaining sub-steps:
  - [x] Audit for other debts in the same drifted state (2026-08-19): only
    Aurora Audiology matched — no other debts drifted.
  - [x] Backfill `date_paid_off` (2026-08-19), derived from each debt's most
    recent linked transaction date, falling back to `current_date` when none
    exists — ran clean, matched only Aurora Audiology per the audit above.
  - [x] Code fix (2026-08-19) in `app.debts.tsx`'s `DebtDialog`/`save()`:
    added `useTransactions()` (already imported for other uses in this file,
    no new fetch) and a `datePaidOff` derivation before the upsert call
    (`app.debts.tsx:690-706`) — when the saved balance is `<= 0` and
    `date_paid_off` wasn't already set, uses the most recent
    `linked_debt_id`-matching transaction's date, falling back to
    `todayISO()` only if none exists; clears it to `null` when the saved
    balance goes back `> 0` and it was previously set (mirrors
    `useReversePayment`'s `payments.ts:664` pattern). `date_paid_off` added
    to the `upsert.mutateAsync` payload (`app.debts.tsx:712`). No schema
    change — `date_paid_off` is an existing base column.

### Phase 2 — bigger builds

- [x] **New monthly summary card** (2026-08-19) — **ADR-073** drafted and
  implemented. New `src/lib/monthly-summary.ts`: `debtsBudgetedByCategory()`
  (mirrors `billsBudgetedByCategory`, excludes paycheck-deducted debts per
  ADR-032), `combinedActualByCategory()` (bills+debts+spending ledger actual
  for one month, extends `buildActualResolver`'s pattern with a
  `linked_debt_id` bucket), `trailingAverageByCategory()` (6 full calendar
  months before the current one, current month never included). New
  `monthlySummary` memo in `app.index.tsx` groups by parent_category like
  `budgetChart`, but — unlike `budgetChart` — includes any category with a
  bill, debt, budget row, actual, or trailing average, not only ones with a
  `spending_budgets` row (so debt-only categories show up). New card
  ("Monthly summary") rendered between "Past due" and the net worth trend
  chart, with `MonthlySummaryTotals`/`MonthlySummaryTile` components
  (`app.index.tsx`, mirror `BudgetTotals`/`BudgetTile`). `BudgetSplitLines`
  gained optional `debtsBudgeted`/`debtsSpent` props (backward compatible —
  the existing "Budget vs actual" card doesn't pass them, so its 2-row
  display is unchanged). No schema change.
- [x] **"Due this period" grouping toggle — Due Date/Category done (2026-08-19)**.
  `app.paycheck.tsx`: `ObligationRow`/`obligationRowKey` extracted (shared by
  both modes), `obligationsByCategory` memo (groups via `groupRows()` from
  `ListControls.tsx`, reused rather than reinventing — subtotal per group,
  sorted descending), small `Select` toggle next to the "Due this period"
  header. Due Date mode is the unchanged original flat list. No schema change.
- [x] **ADR-074 drafted and approved** (2026-08-19) — see `docs/DECISIONS.md`.
- [x] **SQL run** (2026-08-19): `usual_payment_account_id` added to `bills`
  and `debts`, backfilled from linked-payment history.
- [x] **Account grouping mode — done (2026-08-19).** `usual_payment_account_id`
  added to `Bill`/`Debt` types (`supabase.ts`). "Usual payment account" picker
  added to both edit forms (`app.debts.tsx`, `app.bills.tsx`) — an explicit
  pick always wins; if left unset, `save()` falls back to the most recent
  linked-payment transaction's account (same derivation the backfill script
  ran once, mirrors the `date_paid_off` fix's pattern). "Group: Account" is
  now a third option in Paycheck Budget's obligations toggle
  (`app.paycheck.tsx`), with an `obligationsByAccount` memo mirroring
  `obligationsByCategory`.

**All 7 items from SCRATCHPAD.md's "Things to work on" are now complete.**

## Tests

- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.
- [ ] Fix the pre-existing `arrears.test.ts` opening-arrears failure (unrelated to recent work, still red).
- [ ] Run the suite (blocked locally by AppLocker) to confirm the new `ledger-state.test.ts` ADR-008 netting regression test passes, and verify live: reverse a cleared bill payment, confirm the bill's cycle state drops back to `unpaid`/`partial` instead of staying `cleared`.

## Follow-up work

- [ ] Revisit Past Due grouping as a true 3-way split now that ADR-068 labels rows Deduction-funded vs HSA-funded — the grouping itself is still binary (`debts.is_paycheck_deduction` only; bills have no equivalent field).

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
