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