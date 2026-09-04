# SESSION.md

## Session Notes

- **Issue #58 — Instacash (MoneyLion) reconciliation.** Traced the ~$234.90
  residual to a missing 6/20/2026 $620 advance (never entered in the ledger).
  Confirmed with the user: both the 7/17 ($443.03) and 7/20 ($234.90)
  repayments went to that advance, with a ~$57.93 fee bundled into the 7/17
  charge (never counted toward the balance — same treatment as the 8/14 Cleo
  Express Fee earlier today). New migration
  `scripts/migrations/2026-09-04-instacash-reconcile.sql` (+ `.verify.sql`):
  adds the missing 6/20 advance transaction + matching `debt_adjustments` row,
  re-links the 7/17 payment and splits it into $385.10 principal + $57.93 fee.
  Advances (3,020.00) − principal repayments (2,420.00) = $600.00, matching
  the stored `remaining_balance` exactly. **Not yet run** — needs the user to
  execute it manually in the Supabase SQL Editor (read-only MCP can't write).
  No schema change; no new ADR (data-only, same pattern as the 2026-09-04
  Cleo/Instacash cleanup under ADR-046/ADR-056).
  - The reconcile script got run twice by accident, duplicating 3 rows (the
    6/20 advance transaction, its `debt_adjustments` row, and the 7/17 fee
    transaction — the one `update` in the script is idempotent, no issue
    there). `scripts/migrations/2026-09-04-instacash-reconcile-dedupe.sql`
    (+ `.verify.sql`) removed the second run's 3 duplicate rows by explicit
    id. Both scripts run + verified live 2026-09-04: 12 Instacash
    transactions, no duplicates, advances $3,020.00 − repaid $2,420.00 =
    $600.00, matching the stored `remaining_balance`. Issue #58 closed.

- **Issue #57 — "Log a historical bill payment" dialog (ADR-084 addendum).**
  Bill equivalent of `LogDebtPaymentDialog`: new `LogBillPaymentDialog`
  (`src/components/LogBillPaymentDialog.tsx`) + `useLogBillPayment()` /
  `isWithinCurrentBillCycle()` / `billCycleWindowStart()` (`src/lib/payments.ts`).
  Date/account/amount/status only — no fee lines, no balance to reduce (bills
  don't carry a running principal like debts). Monthly bills use the
  ADR-086 calendar-month window; non-monthly keep the rolling
  `next_due_date`-anchored window; one-time bills are always in-cycle.
  Wired into `app.bills.tsx` next to `PastDueEditor`. New tests in
  `payments.test.ts` (4 cases: monthly, monthly-early-due-day, non-monthly,
  one-time) — suite 177 → 181, `tsc --noEmit` clean.
  Verified live in-browser (TEST household, Playwright): dialog renders,
  hint text correctly switches between "Applies to the current cycle…" and
  "Historical — ledger only…" based on the picked date; no console errors;
  no stray data left behind. Not yet committed.

- **Issue #56 — AccountDetailDialog.** Accounts get the same full detail
  dialog Bills/Debts/Institutions already have — new `AccountDetailDialog` /
  `AccountBalanceHistory` / `AccountAllTransactions` in
  `src/routes/app.accounts.tsx` (colocated with the route, same convention as
  `BillDetailDialog`/`DebtDetailDialog`). No schema change and, per the user,
  no new ADR (confirmed this is a UI composition of already-decided patterns,
  same as the other three detail dialogs). Shows full metadata (type,
  institution via `LogoLabel`, owner, card last-4, credit limit, notes), the
  ADR-093 `InstitutionLoginButton`, complete balance-snapshot history
  (`useAccountBalances`, already a full-history hook — no cap needed, live
  data tops out at 4 snapshots/account), and every transaction on the account
  (capped at 20 with a "Show all N" expand — live data has one account at 241
  transactions, so unconditional rendering was rejected). The account card is
  now click-to-open like Bills/Debts/Institutions rows; the Edit pencil,
  "Log new balance" button and Recent Activity row clicks got
  `stopPropagation` so they still work independently. "Log balance" in the
  new dialog's footer reuses the existing `LogBalanceDialog` instance via the
  parent's own state rather than creating a second one. `tsc --noEmit` and
  full test suite (181 tests) clean — no new pure-function logic, so no new
  test file. Verified live in-browser (TEST household, Playwright): dialog
  opens, all metadata renders, balance history shows the real snapshot,
  transaction list renders and a row opens `TransactionDetail` stacked
  correctly, Log balance stacks and prefills correctly, Edit handoff closes
  the detail dialog and opens the prefilled `AccountDialog` form. Not
  exercised against an institution-linked account (TEST household has none)
  — that code path directly reuses `InstitutionLoginButton`/`LogoLabel`
  exactly as Bills/Debts/Institutions already do, so not considered a gap.
  Not yet committed.

- **Dashboard Simple/More Info toggle (ADR-096).** New `Switch` beneath the
  Combined Spendable hero, remembered per device (`localStorage`, default
  Simple). "More Info" is the existing Dashboard unchanged, wrapped in a
  conditional. "Simple" is a new condensed per-pay-period card set: Income /
  Spendable, Bills/Debts (total + paid so far/pending/overdue via
  `StatusBreakdownCard`, new), and Spend (11 custom category groups, reusing
  the existing `BudgetTotals`/`BudgetTile`/`BudgetSplitLines` components
  unchanged with a differently-grouped `BudgetGroup[]` — tap-to-expand
  transaction drill-down comes for free). All in `src/routes/app.index.tsx`
  — no new files, no schema change.
  - Confirmed with the user: overdue reuses the existing household-wide Past
    Due figure (ADR-049), and the category-group mapping follows existing
    `parent_category` on the two cases that conflicted with the user's
    literal wording (Software & Tech → Fun, Shopping → Misc) — see ADR-096
    for the full mapping table and rationale.
  - `tsc --noEmit` and full test suite (181 tests, unchanged — no new pure
    logic needing its own test file) clean. Verified live in-browser against
    the TEST household (Playwright): toggle switches views and persists
    across reload, Income/Spendable/Bills/Debts figures render, Bills/Debts
    overdue sub-totals ($215.00 / $375.00) exactly match the existing "Past
    due" card's $590.00 total split by kind — cross-verified correct. Spend
    section renders empty (TEST household has zero `spending_budgets` rows —
    confirmed via the read-only MCP, not a bug). Debts "Paid so far" reads
    $0.00 on a debt the "Still owed this period" card shows as partially
    paid — investigated and confirmed correct: `deriveCycleInfo`'s ledger
    walk excludes a payment dated before the cycle's current due-date
    window once that window has passed, same documented stored-vs-derived
    divergence as ADR-085, not a bug introduced here. No console errors, no
    stray data. Committed + pushed (`ed731bc`).

- **Dashboard Simple view refinement pass (ADR-096 addendum).** Seven
  tweaks after first using the shipped toggle: bigger/wider toggle
  (`scale-125` switch, `text-base` clickable labels); dropped the redundant
  "Spendable" row from the Income card; `StatusBreakdownCard` (Bills/Debts)
  gained a colored header band + icon + bigger title, an `ItemBar` (paid/
  pending vs. total), a "Remaining" row (`Total − Paid`, matching
  `billRemainingOwed`/`debtRemainingOwed`), and a `HelpButton` on "Overdue"
  reusing the existing Past Due wording; the Spend section's tiles switched
  from `BudgetTile` to a new `SimpleSpendTile` whose expansion shows an
  institution-by-institution breakdown (mirrors `app.spending-by-place.tsx`'s
  row) instead of the Spending/Bills/Debts split — `BudgetTile` itself is
  untouched, More Info's own "Budget vs actual" card still uses it unchanged
  (confirmed live).
  - `tsc --noEmit` and full test suite (181 tests) clean. Verified live
    in-browser against the TEST household (Playwright): seeded a temporary
    institution + spending_budgets row + one transaction via
    `scripts/test-db.mjs` (ADR-083) to actually exercise the institution
    breakdown (TEST household had no institutions/budgets otherwise);
    confirmed the tile expands to "TEST Grocery Co · $42.50 · 100%"
    correctly, then deleted all three fixture rows and confirmed zero
    remain. No console errors. Committed + pushed (`ed731bc` was the base
    toggle; this refinement not yet committed).
