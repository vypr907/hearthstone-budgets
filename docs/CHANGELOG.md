## 2026-07-28 – Supabase Schema Migration & Data Import

### Completed

* Migrated `accounts` table to the new schema by:

  * Adding `account_number`, `interest_apy`, `credit_limit`, `account_subtype`, `is_spendable`, and `include_in_net_worth`.
  * Renaming/fixing columns to align with the current data model.
* Imported account data using an `accounts_import` staging table to map institution names to UUID foreign keys and populate required `household_id` values.
* Imported account balances using a `balance_import` staging table, including mapping account names to account UUIDs and filling missing `as_of_date` values.
* Updated the `bills` schema:

  * Replaced `due_day` with `next_due_date`.
  * Removed deprecated `paid_with`.
  * Added `billing_cycle` and `manual_or_auto`.
* Created a `bills_import` staging table to support CSV imports and UUID mapping.
* Normalized legacy payment status values (`Due`, `Current`, `Overdue`) to the current schema values (`unpaid`, `cleared`).
* Updated the Bills relationship to reference **Institutions** instead of **Accounts**, including changing the foreign key constraint.

### Notes

* Staging tables (`accounts_import`, `balance_import`, `bills_import`, `debts_import`) proved to be an effective migration strategy for converting legacy AppSheet CSV exports into the normalized Supabase schema while preserving referential integrity.
* Legacy category names required mapping to the new canonical category taxonomy during import.
## 2026-07-28 – Bills & Debts Schema Migration and Import Updates

### Completed

* Migrated Bills data model to support flexible scheduling:

  * Replaced `due_day` with `next_due_date`.
  * Added `billing_cycle` and `manual_or_auto`.
  * Removed deprecated `paid_with` field.
  * Updated bill imports to use staging tables for CSV migration.
* Created and used `bills_import` staging table:

  * Added support for mapping CSV category names to category UUIDs.
  * Added support for mapping institution references before inserting into production tables.
  * Normalized legacy payment statuses:

    * `Due` → `unpaid`
    * `Overdue` → `unpaid`
    * `Current` → `cleared`
* Updated Bills relationship model:

  * Changed bill ownership relationship from Accounts to Institutions.
  * Updated foreign key mapping so `bills.institution_id` references `institutions.id`.

### Debts Migration

* Created `debts_import` staging table for CSV migration.
* Updated debt imports to support:

  * Category UUID mapping.
  * Institution UUID mapping.
  * Household UUID population.
  * Legacy boolean payment status conversion:

    * `TRUE` → `cleared`
    * `FALSE` / `NULL` → `unpaid`
* Added data cleanup for required fields:

  * Populated missing `on_payment_plan` values with `FALSE`.
  * Populated missing `interest_rate` values with `0`.
* Updated Debts relationship model:

  * Migrated debt references from Accounts to Institutions.
  * Updated foreign key mapping so `debts.institution_id` references `institutions.id`.

### Schema Improvements

* Continued migration away from CSV/AppSheet-friendly structures toward normalized Supabase relationships.
* Standardized the separation between:

  * **Institution** = company/vendor owed money (GCI, MoneyLion, Aaron's, etc.)
  * **Account** = financial account used to pay or track money movement (checking, savings, credit card, etc.)
* Continued using staging import tables (`*_import`) as the standard migration process for converting legacy data into normalized UUID-based schemas.

### Notes

* Remaining cleanup may include removing legacy fields after validation (`due_day`, old account references, etc.).
* Future scheduling improvements should keep Bills and Debts aligned around shared recurrence concepts (`next_due_date`, `billing_cycle`, and related scheduling fields).

## [Unreleased] - 2026-07-28

### Fixed
- Bills screen not displaying any rows (RLS/scoping ruled out; frontend query bug)
- Debt checkbox write violating `debts_payment_status_check` (legacy value instead of unpaid/pending/cleared)
- Marking a bill/debt paid failing with `NOT NULL` violation on `transactions.account_id`
- Bill cycle-advance always adding +1 month regardless of `billing_cycle` (biweekly bills now advance +14 days, etc.)
- "Undo" only resetting `payment_status` without deleting the transaction or reverting `next_due_date` / `remaining_balance`
- Everything screen checkbox not reflecting cleared status (root cause: checkbox was bound directly to `payment_status`, which intentionally rolls back to `unpaid` on clear)
- Everything screen jumping straight to `cleared` in one tap instead of following submit → clear

### Added
- Status badges (unpaid/pending/cleared) and full detail views on Bills and Debts
- Mark-paid (submit/clear) actions on Bills and Debts, backed by a shared ledger helper (`src/lib/payments.ts`)
- Sort, group, and multi-select category filtering on Bills and Debts
- New Institutions screen (list, detail, accounts-under-institution, add/edit/delete) — no password field
- New Transactions screen (ledger view, filter by account/status, sort by date/amount, linked bill/debt detail)
- New "More" nav entry housing Institutions and Transactions
- Multi-category support for institutions via `institution_categories` join table, with matching multi-select UI
- Account resolution at payment time: auto-select if an institution has exactly one account, prompt if multiple, block if none
- Three-state ledger-aware control on the Everything screen (unpaid → pending → cleared), reading real-time state from a new `src/lib/ledger-state.ts` helper rather than raw `payment_status`
- Paid/unpaid filters on Everything now use ledger state instead of `payment_status`

### Changed
- Everything screen's paid/unpaid logic now routes through `payments.ts` (previously a separate, older direct-status toggle)

### Removed
- `institutions.category_name` (unused leftover column from CSV import staging, superseded by `institution_categories`)

### Documentation
- Corrected `SCHEMA.md`: `bills` and `debts` reference `institutions.institution_id`, not `accounts.account_id` (prior docs were stale/contradictory)
- Added ADR-005 through ADR-010 to `DECISIONS.md`:
  - ADR-005: Institutions support multiple categories (join table)
  - ADR-006: Bills and Debts reference Institutions, not Accounts
  - ADR-007: Account selection resolved at payment time
  - ADR-008: Undo is a full reversal (transaction deleted, due date/balance reverted)
  - ADR-009: Everything checkbox is ledger-aware, not `payment_status`-aware
  - ADR-010: Everything checkbox cycles submit → clear, matching Bills/Debts
- Updated `CONTEXT.md` to reflect current Phase 3 status and all schema corrections
- Updated PLAN.md's Phase 3.5 section to match actual implementation (account resolution, undo, per-cycle date advancement)

### Still Open
- Accounts screen missing spendable/current balance display, sort/filter/search (per original Phase 3.5/PLAN.md spec)
## 2026-07-31 – Payment Schedule Screen & Dashboard Charts

### Completed

* Added **Payment Schedule** screen (More → Payment Schedule, `/app/payment-schedule`) projecting the next 12 months of debt payments from the household's active strategy and extra monthly payment: which debts get paid, how much, remaining balance, and a "Paid off" badge.
* Added a large per-month "Mark paid" check-off, stored in the shared `payment_schedule_checkoffs` table (device-local storage retained only as an error fallback).
* Added Dashboard charts:

  * Net worth trend line (6 months, per `account_type` plus total).
  * Spending-by-category bars for the current month (cleared money-out transactions).
  * Payoff-progress bar per debt using `(starting_balance - remaining_balance) / starting_balance`.
* New modules: `src/lib/payment-schedule.ts`, `src/lib/net-worth.ts`.
* New hooks: `useScheduleCheckoffs`, `useToggleScheduleCheckoff`, `useAllAccountBalances`.

## 2026-07-31 – Variable-Amount Bills & Partial Payments

### Completed

* Added a "Variable amount" toggle to the bill add/edit form (`bills.is_variable_amount`); the amount field relabels to "Typical amount" when enabled.
* Marking a variable bill submitted/cleared now prompts for the amount owed this cycle (defaults to remaining owed, else `cycle_amount_due`, else `bills.amount`) and stores it in `cycle_amount_due` on the first payment of the cycle. Fixed-amount bills skip the prompt.
* Clearing a bill payment adds the transaction amount to `cycle_paid_to_date`:

  * Full payment advances `next_due_date`, resets `payment_status` to `unpaid`, and clears the cycle fields.
  * Underpayment keeps `payment_status` as `pending` within the same cycle so a follow-up payment can be submitted.
* Bill cards show "X still owed"; the detail dialog shows Due / Paid / Remaining for the cycle when they differ from `bills.amount`.
* Undo reverses a partial payment without rolling the cycle back.

### Notes

* Debt payment logic was intentionally left unchanged.

## 2026-07-31 – Debt Billing Cycles

### Completed

* Debts now expose `billing_cycle` (monthly / biweekly / quarterly / bimonthly / annually / custom) and `next_due_date` on the list card, detail dialog, and add/edit form (dropdown, defaults to monthly).
* Monthly debts continue to use `due_day`; non-monthly debts show/edit `next_due_date`.
* Added `debtDueDate()` helper in `src/lib/format.ts`; the effective due date drives overdue status, Everything sorting, and the Dashboard overdue list.
* Clearing a non-monthly debt advances `next_due_date` via the shared `advanceDate()` helper; undo reverses it with `reverseDate()`. Monthly debts keep the existing reset.

## 2026-07-31 – Debt Payoff Simulation: known_finance_charge Fix

### Fixed

* `src/lib/debt-payoff.ts` now starts simulation for debts with `known_finance_charge` at `balance + known_finance_charge` and skips `interest_rate` accrual for those debts entirely.
* Previously the known charge only overwrote the final displayed interest, so payoff months and rollover timing were wrong. Display logic already used the known charge and is unchanged.

## 2026-07-31 – Verification Pass: Schedule Check-offs & account_type Casing

### Verified

* Payment Schedule check-offs already read/write `payment_schedule_checkoffs` (`household_id`, `month`) via `useScheduleCheckoffs` / `useToggleScheduleCheckoff`; the table exists in Supabase, so check-offs are household-shared. No change required.

### Fixed

* The account dialog's free-text Type field saved values as typed (e.g. "Checking"). It now writes `trim().toLowerCase()` so `account_type` is always stored lowercase. Display labels unchanged.

## 2026-07-31 – Account Dialog: is_spendable & credit_limit

### Completed

* Account add/edit dialog now exposes a "Spendable" checkbox bound to `accounts.is_spendable`.
* Added a "Credit limit" currency input bound to `accounts.credit_limit`, shown only when `account_type` is "credit" and saved as `null` for other types.
* No balance calculation logic changed — this only exposes existing columns.

## 2026-07-31 – ADR-023: Credit Accounts Contribute Available Credit

### Changed

* The combined household spendable total now uses `spendableContribution()` in `src/lib/balances.ts`: checking contributes its raw spendable balance, credit contributes `credit_limit - creditOwed(spendable)`.
* Credit accounts with a null or 0 `credit_limit` are excluded from the combined total and listed in a warning under the Dashboard "Spendable balance" card (`creditAccountsMissingLimit()`).
* Per-account displays and `computeBalances()` output are unchanged; ADR-013 inclusion rules are unchanged.

### Notes

* Live data check: all three credit accounts (Mission Lane 1600, CreditOne 300, Milestone 300) have limits set, so nothing is currently excluded.

## 2026-08-01 – Paycheck Budget

### Completed

* Added **Paycheck Budget** (More → Paycheck, `/app/paycheck`): pay-date picker over all primary `income_events` (past/future, expected/received) and a pay-period range (this event's date → next primary event, else +14 days).
* Period view lists bills/debts due in range with a total, secondary income in range, per-category allocation sliders/inputs writing `pay_period_allocations`, and a large color-coded remaining figure (blue = room left, green = zero, red = over-allocated).
* Read-only deposit splits shown when `income_source_splits` rows exist.
* Trends tab: stacked bar chart of `allocated_amount` per category across pay dates, with a table alternative.
* Income tab: create `income_sources` (name, cadence, `is_primary`, typical amount) and `income_events` (expected/actual date + amount).
* New modules: `src/lib/income-hooks.ts`, `src/lib/paycheck-budget.ts`, `src/routes/app.paycheck.tsx`; types added to `src/lib/supabase.ts`.

### Changed

* Upgraded zod to v4 — the TanStack Start plugin requires `.prefault()` and the dev server refused to boot on zod 3.

### Still Open

* `income_source_splits` editing is intentionally not built.
* Allocation categories fall back to all categories when none have `domain = 'spending'`.

## 2026-08-01 – Visual Restyle Pass

### Completed

* Presentation-only restyle (no query/schema/logic changes): new design tokens in `src/styles.css` (`--brand`, `--gradient-brand`, `--shadow-card`, `--item-1..6`, soft neutral `--background`); cards are 16px radius, borderless with a soft shadow; bottom nav is icon-only with a filled rounded chip behind the active icon.
* New `src/components/viz.tsx`: `ProgressRing` (48px), `ItemBar` (per-item rotating colors), `EmojiIcon` + `emojiFor`, `itemColor` palette.
* Dashboard rebuilt around a single gradient hero card ("$X to go · Y% paid off", spendable/obligations tiles, slim progress bar baked into the bottom); spendable breakdown, budget-vs-actual rings, spending bars, payoff bars and overdue rows restyled with bold amounts and small uppercase labels.
* Bills, Debts, Accounts and Spending gained emoji icons, bold/large dollar amounts, small gray uppercase labels, per-item recolored progress bars (Bills partial payment, Debts payoff) and progress rings on Spending rows.

### Still Open

* No donut chart exists yet, so the "total centered in the donut hole" rule has nothing to apply to.

## 2026-08-02 – ADR-027: Savings Goals

### Completed

* New `/app/goals` screen (linked from More) listing sinking-fund cards with `EmojiIcon`, `ProgressRing`/`ItemBar`, days-left and "save $X/month" math, plus New Goal / Edit / Delete.
* `+ Add` / `− Withdraw` quick entries write a cleared transaction with `linked_goal_id`.
* `current_amount` is derived, never stored: `computeGoalBalances()` in `src/lib/balances.ts` sums cleared transactions per goal, with `monthsRemaining`/`daysRemaining` helpers.
* New hooks `useSavingsGoals` / `useUpsertSavingsGoal` / `useDeleteSavingsGoal`; `SavingsGoal` type and `Transaction.linked_goal_id` added.

### Still Open

* The `savings_goals` table and `transactions.linked_goal_id` column must be created manually in Supabase (see ADR-027 SQL); until then the screen shows an empty list or a query error.

## 2026-08-02 – ADR-028: Status Snapshot & Settings

### Completed

* New `/app/snapshot` (linked from More) rendering a one-page snapshot: header (household name + now), red-accented Overdue section with per-item days overdue and a total, Next-14-days section sorted soonest first, and next primary paycheck (date + expected amount). Uses `EmojiIcon`/`ItemBar`.
* Export: one html2canvas render, two encodings — PNG by default, single-page jsPDF when `households.export_format = 'pdf'`. New `/app/settings` screen toggles that column.
* New files `src/lib/snapshot.ts` (`buildSnapshot`/`exportSnapshot`), `src/routes/app.snapshot.tsx`, `src/routes/app.settings.tsx`; new hooks `useHousehold`/`useSetExportFormat`; `Household.export_format` + `ExportFormat` types.
* Snapshot styling pass (data logic untouched): gradient brand hero card (household name, timestamp, combined due-now + 14-day total, `ProgressRing` showing the overdue share), shadowed 16px cards, bold tabular amounts with small uppercase gray labels, per-item rows.
* One-page cap enforced via `SNAPSHOT_MAX_ROWS`/`topByAmount`: Overdue shows the bold "$X overdue across N items" total plus the top 5 by amount, then "+N more overdue — see full list in app."; Upcoming shows total + top 5 by due date with the same note. Next paycheck stays a single line. Overdue carries a destructive border/tint accent; upcoming stays neutral.

### Changed

* Uses `html2canvas-pro` instead of html2canvas 1.4.1, which throws on the app's oklch color tokens; the unused html2canvas dependency was removed from `package.json`.

### Fixed

* `exportSnapshot` measures the capture node (width / `windowWidth` / its own background) instead of the body, so the styled card layout is reproduced rather than reflowed.
* Added `foreignObjectRendering: true`, delegating rendering to the browser's native SVG foreignObject painter and restoring card backgrounds/shadows, the app font, and the colored progress-ring arc.
* Fixed export cropping by passing explicit `width`, `height`, `x`, `y`, `scrollX`, `scrollY` and capturing a clone rendered in a fixed-position `(0,0)` off-screen wrapper, preventing the original node's document offset from shifting the foreignObject origin. Verified by headless capture: PNG is 800×1102 (node size × scale 2), full card width, no clipped text or empty areas.

### Still Open

* The `alter table households add column export_format ...` migration must be run manually in Supabase; until then Settings saves error and exports fall back to PNG.

## 2026-08-03 – ADR-007 Correction: Pay-Time Account Resolution

### Fixed

* The "Which account paid this?" picker in `src/lib/pay-flow.tsx` now lists **all** household accounts instead of only accounts under the bill/debt's own institution.
* The picker highlights and preselects the account that most recently paid that same bill/debt (most recent transaction with a matching `linked_bill_id`/`linked_debt_id`, marked "Last used").
* Removed the "No account linked to X's institution" block — a vendor institution with no accounts of its own is normal, not an error.

### Still Open

* With no payment history no account is preselected, so a tap is always required.

## 2026-08-03 – ADR-029 & ADR-030: Category and Institution Visual Metadata

### Completed

* New Categories screen (`/app/categories`, linked from More) with an emoji icon picker and a fixed-palette color picker writing `categories.icon` / `categories.color`.
* Categories and Spending rows show the stored icon and color accent, falling back to a gray generic tag when null.
* Institutions gained a `logo_url` field, suggested from `login_url` as `https://www.google.com/s2/favicons?domain={domain}&sz=128` and editable before save (never a silent background write).
* Institution list and detail show the logo with an institution-type icon fallback, title-cased type labels (`credit_card` → "Credit Card") and a code-side per-type icon/color map.
* Added a UI-only "Group by" (type / category) control on the Institutions screen, and linked Bills and Debts in the institution detail view alongside Linked Accounts.
* New module `src/lib/visual-meta.ts` and component `src/components/InstitutionLogo.tsx`.

### Still Open

* `categories.icon`, `categories.color` and `institutions.logo_url` must exist in Supabase — schema is managed outside the app.

## 2026-08-03 – ADR-031: Institution-Level Balance & Due Aggregation

### Completed

* Institutions list and detail show computed Current Balance and Current Due, calculated on render and never stored (`computeInstitutionTotals()` in `src/lib/balances.ts`).
* Institutions with linked accounts sum those accounts' current balance using the existing `balances.ts` formula and show no Current Due.
* Institutions with only bills and/or debts sum open debt balances plus open bill-cycle amounts for Current Balance, and unpaid bill remainder plus minimum payments on debts due today or earlier for Current Due.
* Institutions with nothing linked render "—". Styling matches the Dashboard/Accounts balance displays.

### Still Open

* "Currently due" for debts is defined as due date ≤ today, so a debt due later this month contributes to Current Balance but not Current Due.

## 2026-08-04 – ADR-032: Paycheck-Deducted Debts

### Completed

* Debt form gained a "Paid via paycheck/HSA deduction" toggle writing `debts.is_paycheck_deduction`, with a badge on the Debts list and detail.
* Deducted debts are excluded from `obligationsInRange()` and surfaced separately via `deductedObligationsInRange()` in the Paycheck Budget "Due this period" card as "Paycheck-deducted (not counted)".

## 2026-08-04 – Debts: Paid-Off Handling & Detail Polish

### Completed

* A payment that zeroes `remaining_balance` now sets `date_paid_off` (`src/lib/payments.ts`).
* Debts list hides zero-balance debts behind a "Show paid off" switch, sorts them to the bottom and shows the paid-off date.
* Billing Cycle labels are title-cased.
* Debt detail gained a "Recent transactions" section (last 10 by `linked_debt_id`).

## 2026-08-04 – ADR-033: Bill Envelopes & Goal Accounts

### Completed

* `monthlyEquivalent()` and `needsEnvelope()` added to `src/lib/format.ts`.
* `useUpsertBill()` returns the saved row and auto-creates one `savings_goals` envelope (`linked_bill_id`) for quarterly, bimonthly and annual bills.
* Goal form can link an optional `account_id`; envelope goals are flagged in the goals list.

### Still Open

* Bill card "Add to envelope" quick-transaction action.

## 2026-08-04 – Account Labels & Pay-Time Picker Polish

### Completed

* Add Transaction and the pay-time account picker show "{name} - {institution} - •••{last4}".
* The picker renders the account-type icon and an institution-logo badge (`accountLast4`, `accountLabel`, `accountTypeVisual`).

### Still Open

* ADR-034 Dashboard hero rework, budget/actual bills split, "owed this pay period by category" card, and moving Net Worth Trend to the bottom.
* Spending screen "Budgeted: $X spending + $Y bills = $Z" split.
* Status Snapshot balances section, pay-period progress bar, and `buildSnapshotSummary()`.

## 2026-08-05 – ADR-035: Universal Partial Payments

### Completed

* `src/lib/payments.ts` gained `debtCycleDue()`, `debtRemainingOwed()`, `payableRemainingOwed()`, a shared `applyClearedPayment()` and `ensureCycleAmount()`.
* Submit always writes a new pending transaction, so a pending item can still take another partial payment; fixed bills get `cycle_amount_due` set on the first submit of a cycle.
* Debts now track `cycle_paid_to_date`; a debt cycle resolves only at >= `minimum_payment`, and Undo reverses partial credits.
* `pay-flow.tsx` prompts in two stages: variable-bill "owed this cycle", then a universal "how much are you paying now?" defaulting to remaining owed.
* "$X still owed this cycle" shows on Bills list/detail, Debts list/detail and Everything.
* Bill detail gained a Recent transactions section (last 10 by `linked_bill_id`); Add Transaction gained an optional "Link to bill/debt" selector routed through `applyClearedPayment()`.

## 2026-08-05 – ADR-036: Ledger-Derived 4-State Payment Cycle

### Completed

* `src/lib/ledger-state.ts` provides pure `deriveCycleInfo()` and `useCycleState()` returning `{ state, due, clearedSum, remaining, transactions, pending, resolved }` with states unpaid / pending / partial / cleared; a resolved cycle is detected by looking back one interval, since clearing advances the due date.
* `useResetCycle()` deletes every transaction in the resolved cycle, zeroes `cycle_paid_to_date` and reverts payment status and `next_due_date` (extends ADR-008 to multi-transaction cycles).
* `pay-flow.tsx` `tap()` drives the machine: unpaid/partial prompt and create a pending tx, pending clears the latest pending tx on its own account, cleared shows an "undo all payments this cycle?" confirm.
* `PayActions` is a single state-aware button shared by Bills and Debts; Everything uses the shared `stateVisual()` (neutral / yellow clock / orange partial / green check) via new `--state-*` tokens in `styles.css`.
* `src/lib/ledger-state.test.ts` covers the Rent 2 case ($609: 500 pending → $109 partial → pending → cleared/rolled → reset deletes both rows).

### Still Open

* End-to-end verification in the live app wasn't possible (external Supabase, no injectable session); logic is covered by the unit test.

## 2026-08-05 – ADR-037: Payable-First Payment Writes & Repair Tools

### Completed

* Live Supabase was missing `debts.cycle_paid_to_date`, which stranded cleared ledger rows against untouched debt rows. Fix applied in the user's project: `alter table public.debts add column if not exists cycle_paid_to_date numeric not null default 0;` plus `notify pgrst, 'reload schema';`.
* `payments.ts` `updateRow()` does bill/debt updates with `.select("id")` and throws when 0 rows change, so silent RLS/schema-cache failures surface.
* Submit and Clear now update the bill/debt FIRST and write the ledger row second, so a failed payable write can no longer strand an orphan transaction.
* `useDeleteLinkedTransaction()` removes a ledger row linked to a bill/debt without touching the payable; Bill and Debt detail "Recent transactions" rows show status and a confirm-gated trash button.
* `src/components/StrandedDebtRepair.tsx` (+ pure `findStrandedDebtPayments()`) shows an amber card on Debts listing debts whose current cycle has cleared rows while `cycle_paid_to_date` is 0 and the cycle never resolved; "Clean up" deletes those rows so the payment can be redone.

### Still Open

* The repair scan is heuristic; it can't see rows the ledger never received.
* Cleaned-up debt payments still need to be redone through Submit / Mark cleared to confirm status, remaining balance, paid-this-cycle and next due date all advance.

## 2026-08-05 – ADR-038: Envelope "Set Aside" Transfers

### Completed

* `src/components/SetAsideAction.tsx` appears on bill detail when a savings goal has `linked_bill_id` = the bill.
* Prompts for source account and amount (default `monthlyEquivalent(bill)`), prompts for and saves `savings_goals.account_id` when unset, then writes two cleared transactions — the debit (no goal link) and the credit tagged `linked_goal_id`. No transfer table.

### Still Open

* No guard against two set-asides in the same month.

## 2026-08-05 – ADR-039: Savings Goals in Paycheck Allocations

### Completed

* `PayPeriodAllocation.goal_id` added; `useSetAllocation()` accepts `categoryId` OR `goalId` and throws when both or neither are given.
* Paycheck Budget gained a "Savings goals" allocation block using the same slider/input UI, and the Allocated / Left-to-allocate math includes goal rows.

## 2026-08-06 – ADR-040: Generalized Custom Billing Cycles

### Completed

* Bill and Debt forms show a number input + Days/Weeks toggle (`src/components/CustomCycleFields.tsx`) when Billing Cycle = Custom; the value is converted to days on save (weeks × 7), saving is blocked without a value, and the unit is derived from the stored `cycle_interval_days` when editing.
* `advanceDate()` / `reverseDate()` / `shiftDate()` gained a `custom` branch shifting by `cycle_interval_days`; a null interval throws `MissingCycleIntervalError` (surfaced as a toast on payment actions) while render-only paths use the new `shiftDateSafe()`.
* `monthlyEquivalent()` prorates custom cycles as `amount * (365.25 / days) / 12`.
* `app.bills.tsx` CYCLES gained the missing `custom` option; `billing_cycle` and `manual_or_auto` are normalized with `.trim().toLowerCase()` on save.

### Notes

* No backfill: existing custom rows without an interval behave exactly as before until edited. Monthly/biweekly/quarterly/bimonthly/annual paths untouched.

## 2026-08-06 – ADR-041: Manual Overrides for Spending Actuals

### Completed

* Every actual cell on the Spending screen is editable; `spending_actuals.is_manual_override` gives a manual total display priority over the ledger sum.
* Saving an edit sets the flag without touching transactions; a one-time confirm warns before overriding a month that already has logged spend.
* A pencil indicator marks overridden cells and reverts them to ledger-derived-first.

### Notes

* Overridden cells report their whole total as spending, since an override intentionally replaces the ledger split.

## 2026-08-06 – ADR-034: Dashboard Rework & Budget/Actual Bills Split

### Completed

* Dashboard hero leads with combined spendable balance and folds the old "monthly obligations" card in as bills-this-period / debts-this-period set-aside totals (paycheck-deducted debts excluded via `obligationsInRange`).
* New "Still owed this pay period" card groups remaining owed by category with icon + colour accent; Net Worth Trend moved to the bottom.
* Overdue card shows `billRemainingOwed()` / `debtRemainingOwed()` instead of the full amount; Payoff Progress filters out paid-off debts (`date_paid_off` set or `remaining_balance <= 0`).
* Pay period comes from the primary income source's latest event, falling back to the calendar month.
* `buildActualResolver()` now splits ledger spend into ordinary spending vs. bill-linked payments (bill-linked transactions inherit the bill's category when the transaction has none); new `billsBudgetedByCategory()` sums `monthlyEquivalent()` per category.
* Spending rows, subtotals and grand total, plus the Dashboard budget-vs-actual card, always show "$X spending + $Y bills = $Z" for both Budgeted and Spent; progress/over-under measures against the combined budget.

## 2026-08-06 – ADR-033 Bill Envelope Quick Action & Spending Month Navigator

### Completed

* `SetAsideAction` gained a `compact` variant (small PiggyBank button) rendered on each bill card in the Bills list, below the pay actions and click-isolated from the card's detail-open handler; it reuses the ADR-038 two-transaction Set Aside flow. Cards for bills without a linked envelope goal render nothing.
* Spending screen gained prev/next month arrows above the category list (tap the month label to jump back to the current month), defaulting to the real calendar month. Rows, subtotals, 3-month average and the ADR-041 edit/override flow all follow the selected month; "Start new month" stays anchored to the ledger's newest month and jumps the view to it.

## 2026-08-06 – ADR-028: Status Snapshot Additions

### Completed

* New "Balances" card shows per-account-type subtotals (checking, savings, credit, investment, retirement, plus any other types) using the existing `balances.ts` spendable formula, headlined by the ADR-023 combined spendable total.
* New pay-period card shows a progress bar of amount covered vs. still owed for the current pay period (falls back to the calendar month when no primary income event covers today), reusing `obligationsInRange()` and the ADR-035 remaining-owed helpers.
* New rule-based `buildSnapshotSummary()` in `src/lib/snapshot.ts` renders a plain-text paragraph covering obligations vs. spendable, overdue items and comfortable surplus; a pure function with no network call so it can be swapped for an LLM version later.

## 2026-08-06 – ADR-042: Allocation Spend Hints & Payment Schedule History

### Completed

* Paycheck Budget allocation rows show "Last month $X · 3-mo avg $Y" per category (`buildActualResolver` over spending actuals + transactions, so manual overrides are respected) with a "Use avg" link that commits the rounded average.
* Payment Schedule gained a collapsible "Previous months" card covering the last 6 months plus any older checked-off month, each with its Mark paid toggle.

### Notes

* Past months show no per-debt breakdown by design — balances have moved on.

## 2026-08-06 – Payment Schedule Per-Debt Payment Status

### Completed

* Payment Schedule rows in the current month card show the ADR-036 ledger state per debt (Pending / Partial / Cleared badge with icon and colour; Partial also shows "$X left"), so the month-level "Mark paid" check-off can be verified before use.
* The current month header shows an "N/M cleared" count alongside the payment count and total.

### Notes

* Future and past months show no status badge — ledger state is only meaningful for the debt's current cycle.

## 2026-08-11 – Phase 7/8: Splits, Invoices, Fees, Income Deposits & Shared Dialogs

### Completed

* ADR-044 split transactions: `split_group_id` on the Transaction type, save/delete split hooks, `SplitLinesEditor`, a split toggle in Add Transaction, grouped display on the Transactions screen and in Accounts recent activity, and a whole-group edit dialog (delete + re-insert on save).
* ADR-045 invoices + adjustments: `debt_type` became a dropdown including Invoice, an Institution dropdown was added to the Debt form, and debt detail gained an Adjustments section (add dialog + per-row delete, payable-first balance write ordering).
* ADR-046 payment fees: optional Fee field in the pay prompt writes a second, unlinked transaction ("Fee: <name>") on the same account using the household "Fees" category, auto-creating that category when missing. Fees never credit the cycle.
* ADR-047 mark income received: each pay date gained a "Mark received" button that writes the source's deposit splits (fixed rows plus a remainder row absorbing variance, `day_offset` applied) as cleared transactions grouped by `split_group_id`. Sources with no usable splits open an account + amount picker instead of silently marking received.
* Shared `InstitutionDialog` and `AccountDialog` components (type dropdown, category multi-select, linked accounts/institution pickers) reused by the Bill, Debt and Institutions screens, with inline "+ Add new institution" / "+ Add account" actions.
* Visual consistency pass: shared `SectionLabel` and `EmptyState` across Bills, Debts, Accounts, Goals, Everything and Transactions; Dashboard hero `bg-white/*` overlays replaced with `bg-brand-foreground/*` opacity tokens for dark-mode legibility.

## 2026-08-11 – Phase 9: Invoices, Arrears & Visual Overhaul

### Completed

* ADR-048 invoices: new `one_time` billing cycle (never rolls, real due date), invoice type defaults to it, an explicit "Original invoice amount" field feeding `starting_balance` (fixing the not-null crash on save), and an "On a payment plan" block with number of payments / final payment.
* ADR-049 arrears: new `src/lib/arrears.ts` (+ unit tests) sums missed cycles and manual carry-in; "Past due carried in" fields on Bill and Debt forms; `PastDueBadge` on Bills/Debts rows; the Dashboard "Overdue" card became "Past due" with a total and per-item cycles-behind count.
* Stranded debt repair no longer flags a debt that was fixed by hand (it also requires the debt to be untouched since the ledger rows were written), and "Hide for now" persists per debt across reloads.
* Paycheck: received pay dates with no deposit rows get a "Post deposits" action that backfills the ledger through the same idempotent flow.
* Institution form: Categories became a dropdown multi-select.
* Bill/Debt saves drop columns the database doesn't have yet instead of failing, so the app works before and after the ADR-048/049 migration.
* Visual pass: new `ObligationIcon` (+ `useInstitutionIndex`) shows the linked institution's logo on Bills, Debts and Accounts rows, falling back to institution type then a name-derived emoji; Dashboard "Budget vs actual" became a headline bar plus ring tiles; the Spending screen gained a chart-led month summary card and condensed expandable ring rows; the More screen became a 3-up icon gallery; Add Transaction's category dropdown shows coloured icon rows and offers inline "save as an institution" with a guessed favicon (`guessMerchantDomain`).

## 2026-08-12 – Phase 10: Arrears Editing, Invoice Numbers, Places & Income Sources

### Completed

* Past due editor (ADR-049) is reachable from both Bill and Debt detail views, so arrears can be added or corrected on existing items.
* ADR-052: new Invoice number field on debts; invoice names auto-compose as "<Institution> - <Invoice number>" until the name is typed by hand, and the invoice number shows on debt detail.
* ADR-051: stranded debt repair no longer re-flags debts whose balance already reflects every cleared payment.
* ADR-053: Add Transaction suggests known places as one-tap chips and links `transactions.institution_id`; unknown places are saved inline with a guessed favicon and linked immediately.
* New "Spending by place" screen (`/app/spending-by-place`): monthly merchant ranking with logo, bar, dollar amount and share of total, plus an untagged-spending footnote, linked from Spending and the More grid.
* ADR-054: new income source detail route (`/app/income-source/$id`) with YTD / all-time / monthly-average stats, next expected paycheck, pay-date history, an Edit source form, and a full deposit-splits editor (add/edit/delete, fixed or remainder, per account, optional day offset). `useUpsertIncomeSourceSplit` / `useDeleteIncomeSourceSplit` added to `src/lib/income-hooks.ts`.
* Paycheck Budget renders income sources as tappable cards with cadence, received count, typical amount and this-year total.
* Phase 10 migration confirmed run in Supabase: `debts.invoice_number` and `transactions.institution_id` persist.

### Notes

* Spending by place only counts transactions that have a place attached; older entries need re-tagging by hand.
* Institutions and Accounts screens still define their own detail dialogs; only the add/edit forms are shared.

## 2026-08-11 – Phase 11 Bug Fixes: Inline Institution Creation

### Fixed

* Inline institution creation from Add Transaction ("Save X as a place") was silently failing with a Radix Select empty-string error and a constraint violation.
  * `institution_type` was hardcoded to `"retailer"`, which is not in the DB check constraint. Changed to `"other"`.
  * `useUpsertInstitution` was calling `.insert()` directly, bypassing `saveWithOptionalColumns`. `logo_url` (a newer column) was causing a hard failure pre-migration. Now routes through `saveWithOptionalColumns` for graceful column stripping.
  * The fallback re-fetch path silently dropped its SELECT error; it now propagates via `throw fetchError`.
  * `saveWithOptionalColumns` threw the raw Supabase error object instead of a real `Error` instance, so `catch (e) { e.message }` was always `undefined`. Now wraps with `new Error(error.message)`.
  * `addMerchant()` catch block now extracts `.message` from plain objects as well as `Error` instances, and logs the raw error to the console during debugging.

## 2026-08-11 – Phase 11 Group 2: Income Source Deductions (ADR-055)

### Completed

* New `income_source_deductions` table (schema confirmed live): `name`, `amount` OR `percent` (one enforced by DB check), optional `destination_account_id`, `is_pre_tax`.
* `IncomeSourceDeduction` type added to `src/lib/supabase.ts`.
* Three new hooks in `src/lib/income-hooks.ts`: `useIncomeSourceDeductions`, `useUpsertIncomeSourceDeduction`, `useDeleteIncomeSourceDeduction`.
* Income source detail view (`/app/income-source/$id`) gained a **Deductions** card (below Deposit splits) with add/edit/delete matching the Splits section pattern.
  * Deduction dialog fields: name, flat-$ vs percent-of-net toggle, value input, optional destination account picker (sentinel "none"), pre-tax checkbox.
  * Radix Select empty-string fix applied: destination account uses `"none"` sentinel mapped to/from `null` at the save boundary.
* Stats subtitle on the detail view now shows "X net · Y gross" when deductions exist (gross = net + Σ deductions, percent computed against net per ADR-055).
* `useMarkIncomeReceived` extended (ADR-047/055): after writing split deposit rows, writes one additional cleared transaction per deduction with a `destination_account_id` set. Description: `"Deduction: <name>"`. Same `split_group_id` as the pay event; idempotency check covers deduction rows too.
* New pay dates auto-post deposits on save (when the income source has usable splits) instead of requiring the manual "Post deposits" button. The manual button is retained for backfilling.
* `useUpsertIncomeEvent` now returns `{ id }` via `.select("id").single()` so the auto-post flow can use the saved event's id.

## 2026-08-11 – Phase 11 Group 3: Transfers and Advances (ADR-056)

### Completed

* `transactions.transfer_group_id uuid` (nullable) confirmed live in Supabase. Added to the `Transaction` TypeScript type.
* Four new hooks in `src/lib/data-hooks.ts`:
  * `useSaveTransfer` — writes two cleared transactions sharing one `transfer_group_id` (negative on from-account, positive on to-account). Blocks same-account transfers. Uses `saveWithOptionalColumns` so the column degrades gracefully pre-migration.
  * `useDeleteTransferPair` — deletes all rows with a given `transfer_group_id`.
  * `useCreateAdvance` — writes a deposit transaction + debt_adjustments row (`adjustment_type='advance'`, positive amount). ADR-037 ordering: debt balance updated before the adjustment row.
  * `useDeleteAdvance` — reverses the debt balance, deletes the adjustment row, then finds and deletes the paired deposit transaction by querying description + date.
* Add Transaction dialog gained a **Transfer** mode tab (alongside Expense). Transfer fields: from-account, to-account, amount, optional description. Mode state changed from `boolean isSplit` to a `TxMode` enum (`"expense" | "split" | "transfer"`).
* Debt detail (DebtAdjustments component) gained an **Advances** section below Adjustments: list of advance rows with amount + date + delete button; Add advance dialog (destination account, amount, date).
* Existing advance adjustments are filtered out of the Adjustments list (`adjustment_type !== 'advance'`) and shown separately.
* `TransactionDetail` delete path: if `transfer_group_id` is set, shows a transfer-specific confirm and calls `useDeleteTransferPair` to remove both sides.

### Notes

* All multi-step writes are sequential Supabase calls (same pattern as SetAsideAction, useDeleteDebtAdjustment). No Postgres RPC — a mid-write crash can leave one side orphaned, same as other existing multi-step writes.

## 2026-08-11 – Phase 11 Groups 4–7: Pay Presets, Adjustments, Spending Donut, Transaction Filters

### Completed

#### Group 4 — Overdue-aware payment allocation (ADR-057)

* Pay dialog (`src/lib/pay-flow.tsx`) now shows three preset chips on the amount stage:
  * **Owed this cycle** — remaining for the current cycle (unchanged default).
  * **Total due (+ $X arrears)** — cycle remainder + live `computeArrears()` total; only shown when arrears > 0.
  * **Other amount** — clears the field for free entry.
* `applyClearedPayment` in `src/lib/payments.ts` extended (ADR-057):
  * **Debts**: overflow beyond the cycle minimum reduces `opening_arrears` (floor 0) and sets `arrears_as_of` to today, written atomically in the same DB update.
  * **Bills**: caps the payment at `remainingThisCycle + opening_arrears`. An "Other amount" entry exceeding this cap throws a clear user-facing error before touching anything. On cycle completion, overflow reduces `opening_arrears` and advances `arrears_as_of`.
* Unit test added to `src/lib/arrears.test.ts`: a bill 3 cycles behind, paid via "Total due", results in `cyclesMissed = 0` and `amountOverdue = 0` after payment — confirming `PastDueBadge` clears.

#### Group 5 — Bill adjustments + affects_balance toggle (ADR-058)

* `DebtAdjustment` type gained `affects_balance?: boolean | null`.
* New `BillAdjustment` type added to `src/lib/supabase.ts`.
* `useAddDebtAdjustment` and `useDeleteDebtAdjustment` updated: when `affects_balance` is `false`, the balance update/reversal is skipped entirely.
* Three new hooks: `useBillAdjustments`, `useAddBillAdjustment`, `useDeleteBillAdjustment`. Bill adjustments modify `cycle_amount_due` for the current cycle only (Option 1 per ADR-058 resolution).
* Bill detail view (`BillDetailDialog`) gained a **BillAdjustments** section mirroring the DebtAdjustments pattern.
* Both add-adjustment dialogs (bills and debts) gained an **Affects balance** toggle (default true). Helper text: "Record only — doesn't change what's owed" when false. Existing rows with `affects_balance = false` show "(record only)" next to the type label.

#### Group 6 — Spending screen visual rework

* New `DonutChart` SVG component added to `src/components/viz.tsx`: accepts `slices[]` (label, value, color), builds arc segments via `strokeDasharray`/`rotate`, merges slices < 2% into "Other", renders a legend of the top 5.
* `SpendingSummary` in `src/routes/app.spending.tsx` now accepts `categorySlices` and renders the donut below the 3-stat boxes.
* "Spending by place" link upgraded from a plain button to a dedicated `Card` with icon and description.

#### Group 7 — Filtering, grouping, drill-down & institution re-tag

* New `src/lib/tx-filter-store.ts`: consume-once module-level pre-filter store for cross-route drill-down.
* `src/routes/app.transactions.tsx` fully updated:
  * **Sort**: date / amount / name.
  * **Group by**: none / day / category / account / place.
  * **Filter panel** (collapsible, shows active count badge): account, status, category, place (institution), linked/unlinked, date-from / date-to. "Clear all filters" button.
  * Transfer rows show a "Transfer" badge.
  * Institution (place) shown in transaction row metadata when set.
  * `TransactionDetail` edit mode now includes a **Place (institution)** `Select` for re-tagging `institution_id` (ADR-053 standing TODO closed).
* `src/routes/app.spending.tsx`: `SpendingRow` expanded section gained a **"Transactions →"** button that sets the pre-filter and navigates to `/app/transactions` pre-filtered to that category.

#### Group 8 — Shared detail dialogs

* Investigated. `InstitutionDetail` and the account detail view share very little content at the detail level (institution shows linked accounts/bills/debts; accounts show recent transactions). No shared component warranted. TODO item closed as investigated.


## 2026-08-13 – Manual pay-period planning & recurrence projection

### Completed

* **ADR-059 — Manual bill/debt allocations in pay periods**

  * Extended `useSetAllocation()` to accept `billId`/`debtId` alongside `categoryId`/`goalId`, with an exactly-one-target guard across all four; `PayPeriodAllocation` gained `bill_id`/`debt_id`.
  * Added a "Plan a payment" dialog to the Paycheck Budget period view that writes a `pay_period_allocations` row for a chosen bill or debt.
  * New "Planned" card renders planned bill/debt rows (with Remove), visually distinct from "Due this period" and never deduplicated against it.
  * Planned amounts now feed the `allocated` total, so "Left to allocate" (ADR-039) includes them.
  * `obligationsInRange()` and due-date bucketing untouched.

* **ADR-060 — Recurrence projection for forward-looking pay periods**

  * Reused the existing interval math (`shiftDate`/`advanceDate`/`shiftDateSafe` in `src/lib/format.ts`); no new billing-cycle logic.
  * New pure `projectOccurrences(item, fromDate, throughDate)` in `src/lib/paycheck-budget.ts` walks a bill/debt forward one cycle at a time, skips `one_time`, and never returns the stored due date.
  * `obligationsInRange()` gained an optional `projectThrough` argument; projected dates bucket with the same half-open `start <= d < end` check and carry `projected: true`. Dashboard and Snapshot callers unchanged.
  * Paycheck Budget "Due this period" rows show a dashed "Projected" badge with a muted amount; projected amounts still count toward obligations total and left-to-allocate.
  * `computeArrears`, stored due dates, and ADR-059 planning untouched.

### Notes

* Both features are display/derivation-layer only for ADR-060; ADR-059 is the only one that writes rows (to the already-migrated `pay_period_allocations.bill_id/debt_id`).

## 2026-08-14 – ADR-061: Color Theme System

### Completed

* Added `household_members.theme` (text, default `standard`, checked against the 7
  selectable values); per-user, not household-shared. SQL written, pending manual run
  in Supabase (see docs/TODO.md).
* New `src/lib/theme.tsx`: `ThemeProvider` reads the current member's `theme` on load
  and sets `data-theme` on `<html>`; `useTheme()` / `useSetTheme()` (the latter shaped
  like `useSetExportFormat`, ADR-028) read/write the row.
* Six `[data-theme="..."]` override blocks in `src/styles.css` (halo, hellokitty,
  purple_dark, purple_pastel, cyber_neon, cyber_stealth) — each overrides exactly the
  token set already defined in `:root` (background, brand/gradient/shadow, item-1..6,
  card/popover/primary/secondary/muted/accent, state-pending/partial/cleared,
  destructive, border/input/ring, chart-1..5, sidebar-*). No new variable names, no
  component changes.
* Settings screen gained a Theme section: a swatch button per theme, applying
  immediately on selection with no reload.
* v1 is colors only — fonts and icon packs are out of scope (future ADR).

## 2026-08-14 – Bug fix: fee-less payments wrongly tagged as 1-line splits

### Fixed

* ADR-046 payment submission (`useMarkSubmitted`, `useMarkCleared` direct-clear
  branch in `src/lib/payments.ts`) stamped every payment row with a
  `split_group_id`, even with no fee entered. A fee-less payment became a
  1-line "split", and editing it then failed with "A split needs at least two
  lines" (the split editor requires >=2 lines to save).
* Payments now only get a `split_group_id` when a fee > 0 is actually paired
  (`hasFee()` reuses the existing 0.005 threshold) — a fee-less payment stays a
  plain transaction, matching ADR-046 as originally decided.
* `useSaveSplitTransaction` (`src/lib/data-hooks.ts`) now saves a group edited
  down to one line as a plain transaction (`split_group_id = null`) instead of a
  1-row split, and the split editor no longer blocks saving at exactly one line
  — this also repairs any already-existing fee-less payments that were
  incorrectly tagged before this fix, the next time they're opened and saved.
* No schema change, no ADR change — this implements ADR-046 correctly rather
  than revising it.

## 2026-08-14 – ADR-061 follow-ups: theme persistence diagnosis & token reference

### Fixed

* Theme switching appeared to save (success toast) but never changed anything:
  `<html data-theme>` stayed put. Live check showed the member row selects fine,
  but `update household_members set theme=...` affected zero rows with no error —
  there is no self-UPDATE RLS policy on `household_members`.
* `useSetTheme()` (`src/lib/theme.tsx`) now `.select("id")`s and throws on a
  zero-row write, so a silent failure can no longer produce a false success toast.
  The required policy + grant SQL is recorded in `docs/SCHEMA.md`.
* `halo` theme block in `src/styles.css` was missing all 8 `--sidebar-*` overrides
  the other five theme blocks define; added, reusing that block's own
  card/brand/secondary/border/ring tokens.

### Completed

* Recreated the ADR-061 theme token reference (both files had been lost):
  `src/components/ThemeTokenPreview.tsx` and `docs/THEME_TOKENS.md`, plus a
  collapsible read-only "Theme token reference" section on Settings showing each
  token as a labeled swatch with its computed value under the active theme.

### Notes

* Investigated 5 VS Code problems in `src/styles.css`: PostCSS parse, `tsc --noEmit`
  and `vite build` all pass — they are VS Code's built-in CSS language server not
  recognizing Tailwind v4 at-rules (`@import ... source(none)`, `@source`,
  `@custom-variant`, `@theme`). Recommended the Tailwind CSS IntelliSense extension.

## 2026-08-14 – ADR-062/063/064: Add Transaction refinements & Fix Places

### Completed

* **ADR-062** — Manual entries in the Add Transaction dialog now default to
  `pending` with a user-editable Pending/Cleared toggle. Bill/debt payments,
  income deposits and transfers keep their own status rules.
* **ADR-063** (amends ADR-053) — Description split into a separate Place picker
  plus a free-text note. Place logic extracted into a reusable
  `src/components/PlacePicker.tsx` (search + inline institution create; behavior
  and storage unchanged).
* **ADR-064** (amends ADR-056) — Transfer mode gained an optional icon-based
  category picker, applied to both rows of the pair (`useSaveTransfer`).
* Editable Date field on Add Transaction, defaulting to today (plain
  `<Input type="date">`, matching bill due dates).
* New "Fix Places" screen (`src/routes/app.fix-places.tsx`, linked from More):
  lists every transaction with a null `institution_id` and assigns a place per row
  through the same PlacePicker, using the ADR-037 repair-scan card pattern with a
  clean state when nothing is unassigned.

## 2026-08-14 – Pending screen & bottom nav change

### Completed

* New Pending screen (`src/routes/app.pending.tsx`) as a top-level bottom-nav
  destination: all pending transactions (linked and manual), sortable by
  date / amount / account / category, groupable by account or category with
  per-group subtotals, plus a pending-total header card.
* Tapping a row confirms, then clears it — bill/debt-linked rows reuse
  `useMarkCleared` / `toPayable` (ADR-035/036/046) so cycle credit and due-date
  rollover match Bills/Debts/Everything; unlinked rows take a plain status
  update. No new clearing mechanism, no new ADR.
* Bottom nav stays at 6 tabs: Accounts was demoted to the More grid to free the
  slot (`src/components/BottomNav.tsx`, `src/routes/app.more.tsx`).

## 2026-08-14 – Invoice status fix & Debt form UX

### Fixed

* Invoice payments didn't update status on Everything: `deriveCycleInfo()`
  windowed linked transactions to (next_due_date − 1 cycle, today]. A one-time
  invoice cycle never shifts, so that window was empty and every payment fell
  outside it — state stayed "unpaid" even though the write succeeded. One-time
  payables now treat all linked transactions as their single open cycle
  (`src/lib/ledger-state.ts`).

### Completed

* Debt form (`src/routes/app.debts.tsx`): Starting balance moved before Remaining
  balance; remaining balance and minimum payment mirror starting balance until
  edited; interest rate is optional and stores null when blank.
* Debt form Type and Institution dropdowns show emoji/logo icons (reusing
  `institutionTypeVisual` / `InstitutionLogo`) with h-14 tap targets.

## 2026-08-14 – ADR-065: Default place on bill/debt payment transactions

### Completed

* `useMarkSubmitted`, the direct-clear branch of `useMarkCleared`, and
  `insertFeeTransaction` (all `src/lib/payments.ts`) now stamp the payment/fee
  transaction with the linked bill's or debt's own `institution_id` at write time
  (extends ADR-046 / ADR-053). No extra user step; the place can still be changed
  afterward via TransactionDetail edit. Manual Add Transaction is unchanged.

### Notes

* A one-time backfill script (not a migration file) was written but **not applied**:
  it sets `institution_id` on existing bill/debt payment and paired fee rows where
  it is null. Until it runs, older payments keep appearing in Fix Places.
