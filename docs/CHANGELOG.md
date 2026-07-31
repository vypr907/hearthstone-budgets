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
