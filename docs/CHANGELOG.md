## 2026-09-03 — Everything row redesign — "Option A / Clean ledger" (no ADR)

* **`src/routes/app.everything.tsx` row layout reworked.** From the reviewed
  design canvas (three options; Steven picked "A — Clean ledger"):
  * Name + bold amount on the top line; a single muted meta line below reads
    **`Status · date`** (e.g. `Pending · Sep 3`) — the status *word* now shows on
    every row, not just "Overdue". An overdue row reads `Overdue · <date>` in red.
  * A partially-paid cycle shows **`Partial · $X left`** (the remaining figure
    replaces the date) instead of the old separate red "still owed this cycle"
    line.
  * **Debts** render `min. $85` (muted "min." prefix); bills stay `$85`.
  * Category is now only a **3px left edge** on the card — the category emoji
    column, the 🧾/💳 kind emoji, and the colored billing-cycle pill are gone.
    Billing cycle lives in the detail view (matches the Bills-list card redesign).
  * Date format is now `Sep 3` (`shortDate()` helper), not `09-03`.
* **Institution logo watermark kept** (Steven's ask) — moved to a larger, fainter
  mark (`h-14 w-14`, `opacity-0.09`) bleeding off the right edge behind the
  amount, clipped by the card, instead of the old 20%-opacity mark behind the
  name that PR #46 had to fight for space.
* Presentation only — no schema, query, or logic change; the tap-to-advance
  circle, filters, sort and group controls are untouched. `npm run typecheck` /
  `npm run build` / `npm test` (124) all green; lint clean on the touched file.
  Verified in a headless browser (viewport 390): no page horizontal overflow,
  rows render, watermark treatment checked with a simulated logo.
* Folded into **PR #46** alongside the dialog-overflow fix (same file, same area).
* Still deferred, now filed as Issues: the urgency-based grouping (Overdue → Due
  this period → Later → Paid, **#47**) and the shrink-on-scroll FAB (**#48**).

## 2026-09-01 — Fix: detail dialogs & Everything rows clipped content (no ADR)

* **Detail dialogs no longer overflow horizontally.** Root cause: `DialogContent`
  is `display: grid` and its child wrappers had the default `min-width: auto`, so
  the 2-column `DetailGrid` forced the body to ~508px inside a 375–512px dialog
  → a horizontal scrollbar (bill dialogs) or a hard right-column clip (debt
  dialogs, which carried `overflow-x-hidden`). Fix: `[&>*]:min-w-0` on the base
  `DialogContent` (`src/components/ui/dialog.tsx`) — verified in-browser to bring
  `scrollWidth` from 556 back to the box width at every viewport.
* Debt dialogs dropped the `w-[calc(100vw-1.5rem)]` override (a foot-gun — `100vw`
  counts the scrollbar gutter); all bill/debt detail + edit dialogs now share
  `max-h-[90vh] overflow-y-auto overflow-x-hidden`.
* **Everything screen row:** the bill/debt name was crushed to 0px on phones
  (line 1 packed date + name + an "Overdue" badge into ~110px). The name now
  gets its own line; the date, kind, cycle pill, "Overdue" badge and
  "still owed" note moved to a wrapping meta line; the fixed-width cycle pill and
  the oversized category-emoji column were trimmed. Name column: 0px → ~135px at
  375px wide.
* `src/routes/app.tsx` — `overflow-x-hidden` on the app shell so no screen can
  push a page-level horizontal scrollbar again.
* Presentation only — no schema, query, or logic change; 124 tests still green.

## 2026-09-01 — ADR-093: "Log In" action on institution & debt detail

* New `src/components/InstitutionLoginButton.tsx` — a "Log In" button on the
  institution detail and debt detail views, shown only when the institution has
  a non-empty `login_url`. Opens that URL via `@capacitor/browser`
  (`Browser.open`) — a system browser / Android Custom Tab, loaded with a
  dynamic `import()` in the click handler (SSR-safe, out of the initial bundle).
  Not `window.open`, an `<a>`, or a WebView: OS-level Autofill (Keeper) only
  triggers on a real browser page.
* When `sign_in_with_google` is true and `login_username` is set, a small
  display-only hint sits next to the button — "Sign in with Google — use
  <username>" — so the right account is picked in Google's chooser (the app
  can't force-select it).
* Adds `@capacitor/core` + `@capacitor/browser` — the project's first Capacitor
  runtime deps. No config file, native project, or scripts (Phase 12). On the
  web build `Browser.open` falls back to a normal new-tab open; the Custom Tab /
  Autofill behaviour arrives once the Android shell lands.
* No schema change, no new storage — the no-password-storage rule is unaffected.

## 2026-08-31 — ADR-092: Aaron's–Dresser lease alignment (data-only)

* **ADR-092** — rent-to-own debts are tracked at **total cost to own**
  (scheduled payment × number of payments), not the early-buyout cash price;
  tax is rolled into the cycle payment, an optional protection plan stays a fee
  line (ADR-046).
* `scripts/migrations/2026-08-31-aarons-dresser-lease-alignment.sql` — applied
  and confirmed live 2026-09-01 (debt `8004b659…`: `starting_balance` /
  `program_start_balance` = $2,330.40 (was the $1,297.42 cash price),
  `remaining_balance` = $1,942.00 after 4 payments, `minimum_payment` = $97.10;
  the four historical payments are $97.10 each). Cash out of the accounts is
  unchanged: each payment row grew $5.06 and its paired tax-fee row shrank $5.06.

## 2026-09-01 — Detail-screen polish; ADR-088 duplicate resolved

### Detail-screen visual polish (presentation only, no ADR)

* New shared chips in `src/components/detail.tsx`:
  * `CategoryChip` — category as a 60%-opacity colour pill with its emoji.
  * `ValueChip` — neutral capitalised badge for enum-ish fields (billing cycle,
    manual/auto), via the existing `formatTypeLabel()`.
  * `LogoLabel` — institution/account name with its `InstitutionLogo` in front.
  * `DetailMoneyStrong` — bold, larger money value, used for the "Total owed"
    rollup line.
* Bill and Debt detail dialogs (`src/routes/app.bills.tsx`,
  `src/routes/app.debts.tsx`) now render Category, Institution/Account, Billing
  cycle and Manual/auto through those chips; the dialog title gained the linked
  institution's logo; "Total owed" uses `DetailMoneyStrong`.
* No schema, query or logic change — consistent with prior visual passes that
  carried a CHANGELOG entry and no ADR.

### ADR-088 duplicate number resolved

* Two unrelated decisions had both been written as `## ADR-088`: "Per-Account
  Owner" (2026-08-27, shipped in PR #39) and "One Edit for linked transactions"
  (2026-08-31, shipped on the same feature branch).
* The linked-transaction-edit decision is renumbered **ADR-091**; its ~9 code
  comment references (`src/routes/app.transactions.tsx`, `src/lib/payments.ts`,
  `src/lib/split-groups.ts` + test) updated to match. ADR-088 now unambiguously
  means Per-Account Owner, and its status line is corrected to "Implemented".
* Also caught up in `docs/CONTEXT.md`: status bullets for ADR-088 (per-account
  owner), ADR-089 (internal transfers aren't spending), ADR-090 (Fix Places
  coverage) and ADR-091.

## 2026-09-01 — ADR-066 payoff-date invariant

* Non-Advance debts now persist `date_paid_off` whenever their remaining
  balance reaches the effectively-zero threshold ($0.005), and clear it when
  reopened. This is shared across payments, linked edits/reversals,
  adjustments, and manual debt edits; reusable Advance debts remain exempt.
* Added a manual SQL migration to repair legacy rows and install a database
  trigger that enforces the invariant for future write paths.
* Verified live 2026-09-01 (read-only Supabase MCP): trigger + function
  installed; no settled non-Advance debt missing `date_paid_off`; no open
  non-Advance debt carrying a stale one; all 12 backfilled payoff dates are
  real payment dates. `scripts/migrations/2026-09-01-enforce-debt-payoff-date.verify.sql`.

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

## 2026-08-17 – ADR-066: Advance-Type Debts Reactivate on Re-Advance

### Completed

* `useCreateAdvance` (`src/lib/data-hooks.ts`) now clears `date_paid_off` in the
  same debts-table update when the advance's target debt has
  `debt_type = 'advance'` and was previously paid off — reactivates the debt in
  place (same id, same history) instead of leaving it hidden as "paid off".
* Fixed `DEBT_TYPES` in `src/routes/app.debts.tsx` (was `"credit_card"`, but the
  DB check constraint enforces `"credit card"` with a space) — the Type picker
  was already an icon-styled `Select` per ADR-054, just had a stale value.
* Debt list and detail now render `debt_type` via the existing
  `formatTypeLabel()` helper (already reused for institution_type/billing_cycle/
  adjustment_type) instead of the raw lowercase string.

### Notes

* No schema change this session — the `debt_type` check constraint migration
  had already been run in Supabase before this work started.
* Live verification still pending — see docs/TODO.md.

## 2026-08-17 – ADR-029/067: Category Icon Expansion & Parent Category Dropdown

### Completed

* `CATEGORY_ICONS` (`src/lib/visual-meta.ts`) expanded twice the same day:
  30 → 54, then 54 → 77 emoji, de-duplicated against what was already offered.
  Same `IconPicker` grid component both times — no UI restructuring, no
  schema change.
* Implemented ADR-067: `CategoryDialog`'s Parent Category field is now a
  `Select` sourced from the household's distinct existing
  `categories.parent_category` values (plus "None"), with an inline
  "+ Add new" text-input toggle for a genuinely new label.
  `categories.parent_category` remains a plain text column — UI-only change.

## 2026-08-17 – ADR-053/063 addendum: Manual Transactions Title from Place

### Completed

* New shared `TransactionTitle` component
  (`src/components/TransactionTitle.tsx`): a manual/generic transaction (no
  `linked_bill_id`/`linked_debt_id`, no `"Fee: "` description) now titles
  itself from its place instead of falling back to generic "Transaction"
  text — place alone when description is empty, `"<Place> · <Description>"`
  (description rendered subdued: smaller, italic, muted) when both are set,
  unchanged `description || "Transaction"` when no place is set.
* Wired into the Transactions list row, its detail dialog title, and
  Accounts' Recent Activity row.
* Fee/Bill payment/Debt payment titles are explicitly gated out (by linked
  id and by a `"Fee: "` description check) and render exactly as they did
  before — those descriptions are written verbatim by `src/lib/payments.ts`
  and are never empty, so they never hit the old fallback either.

## 2026-08-18 – Mobile Polish Pass (8 items)

### Completed

* Planning pass first (spec-only, no code): root-caused the Dashboard grid
  cutoff, confirmed the "boring card" pattern was shared by `BudgetTile` and
  `SpendRow`, documented the hero set-aside formula as a 2026-08-18 addendum to
  ADR-034 in `docs/DECISIONS.md`, and resolved four judgment calls with the
  user (dual progress bars over a 2x2 grid, amount **range** search, Payoff
  Progress collapsible defaulting closed, items 7/8 built rather than noted).
* Safe-area clearance: `src/routes/app.tsx` uses
  `pb-[calc(6rem+env(safe-area-inset-bottom))]` and the `AddTransactionFab`
  FAB `bottom-[calc(6rem+env(safe-area-inset-bottom))]`; `BudgetTile`'s
  over/left caption bumped `text-[10px]` → `text-xs`.
* New `src/components/BudgetSplitLines.tsx` — dual `ItemBar` rows (Spending vs
  Bills) with an optional `extra` line, rendered in `BudgetTile`
  (`app.index.tsx`) and `SpendRow` (`app.spending.tsx`, `extra` = 3-month avg).
* Paycheck Budget: sticky, safe-area-aware "left to allocate" pill inside
  `PeriodBudget`, additive to the existing Card and sharing its value/colour
  logic.
* Transactions: persistent description/place search input plus "Amount from" /
  "Amount to" range inputs, wired into the filter chain, `activeFilterCount`
  and `clearFilters()`.
* New `src/components/HelpButton.tsx` (Popover + HelpCircle) on the Dashboard
  hero set-aside figure, Available credit row, Past due header and the
  Paycheck "Projected" badge.
* Dashboard reorg: Payoff progress moved below "Still owed" and made
  collapsible (default closed); Past due split into a "Paycheck / HSA
  deduction" group (via `debts.is_paycheck_deduction`) and "Other", extracted
  as a shared `OverdueRow`. `overdueTotal` unchanged.
* Transfer mode gained static helper text explaining that transfers move money
  between the household's own accounts, so no Place is needed.
* `TransactionDetail` exported from `app.transactions.tsx` and mounted in
  `app.accounts.tsx`; Recent Activity rows are now clickable.

### Notes

* No schema changes; no new ADRs (references ADR-023/029/032/034/039/049/053/
  056/059/060/063). Typecheck clean.
* Past Due grouping is binary only — a true Deduction-vs-HSA 3-way split needs
  schema work that stayed out of scope.

## 2026-08-18 – ADR-070: Payment Reversal Tool

### Completed

* `src/lib/payments.ts`: new `useReversePayment()` — rolls the payable back
  first through the existing `updateRow()` guard (`.select("id")`, throws on 0
  rows) and only then inserts the offsetting cleared transaction, so a failed
  payable write can never leave an orphan reversal row.
  Bills: `cycle_paid_to_date = max(0, paid - abs(amount))`, `payment_status`
  back to `unpaid` when below `cycle_amount_due ?? amount`.
  Debts: same cycle rule plus `remaining_balance += abs(amount)` and
  `date_paid_off` cleared.
* New `src/components/ReversePaymentButton.tsx`: Undo2 icon button beside the
  trash button, shown only for cleared, bill/debt-linked, negative rows, with a
  confirm dialog and a reversal-date field defaulting to today.
* `app.bills.tsx` / `app.debts.tsx`: Recent transactions sections now take the
  full bill/debt row and render the reverse button.

### Notes

* Patterns reused from ADR-037 (payable-first writes) and ADR-046 (fee/ledger
  pairing); no new ADR created. No schema changes.

## 2026-08-18 – ADR-068: Deduction-Funded Bill/Debt Auto-Payment

### Completed

* Diagnosis: mark-paycheck-received is `useMarkIncomeReceived()` in
  `src/lib/income-hooks.ts`; it builds net split deposits from
  `income_source_splits` and appends one deposit per deduction with a
  `destination_account_id` (percent computed against the event's
  `actual_amount`), inserted together sharing `split_group_id = income_event.id`.
  Cycle state comes from `deriveCycleInfo()`; the single payment writer is
  `applyClearedPayment()`.
* New `src/lib/deduction-funding.ts` → `applyDeductionFundedPayments()`:
  settles the CURRENT cycle only for bills/debts whose `funding_deduction_id`
  matches a funded deduction. Payable written first, then the deduction's
  deposit transaction is linked (`linked_bill_id` / `linked_debt_id` +
  `split_group_id`). Amount mismatch → paid anyway plus a
  `deduction_payment_events` row (`event_type='mismatch'`, `expected_amount` =
  cycle due, `actual_amount` = posted deduction). Already-cleared cycle →
  untouched, `already_paid_noop` row logged. No future-cycle pre-pay.
* `income-hooks.ts`: deposit insert now `.select("id")` so each deduction's
  transaction id is known; bills/debts queries invalidated after the run; new
  `useHouseholdDeductions()` hook.
* `app.bills.tsx` / `app.debts.tsx`: "Funded by deduction" picker with
  reporting-only deductions disabled, plus a save-time block with an inline
  error (app-level rule, not a DB constraint).
* `app.index.tsx`: past-due rows funded by a deduction carry a
  "Deduction-funded" / "HSA-funded" badge; the HSA case is derived from the
  destination account's `account_type`/`name` since `accounts` has no
  `include_in_net_worth` column here.

### Notes

* Schema (`bills.funding_deduction_id`, `debts.funding_deduction_id`,
  `deduction_payment_events`) was applied manually in Supabase before this work
  and was not re-run. Extends ADR-055; no new ADR created.
* Known issue: the pre-existing `arrears.test.ts` failure (opening-arrears
  expectation) is unrelated and still failing.

## 2026-08-18 – ADR-069: Ad-Hoc Income Category (code side, pre-migration)

### Completed

* `src/lib/data-hooks.ts`: new `categoryDomain()` helper and an optional
  `domain` argument on `useCategories()` (no-argument behavior unchanged);
  `useUpsertSpendingBudget()` now refuses to write a budget row against an
  `income`-domain category.
* `src/lib/spending-actuals.ts`: `buildActualResolver()` and
  `billsBudgetedByCategory()` accept an optional `categories[]` and explicitly
  exclude income-domain categories instead of relying on the amount sign as an
  incidental filter.
* `app.index.tsx` / `app.spending.tsx`: budget grids and the budget category
  picker include `domain='spending'` rows only.
* `src/components/AddTransactionFab.tsx`: explicit **Income** mode
  (Expense | Income | Transfer). Income mode offers `domain='income'`
  categories only, stores a positive amount, and hides split entry and
  bill/debt linking; Expense/Split modes now offer `domain='spending'`
  categories only.

### Notes

* Mode is user-chosen, never inferred from the amount sign.
* Until the manual SQL migration extending `categories.domain` to `'income'`
  and inserting the four income categories (Income, Credit, Refund, Gift) runs,
  Income mode shows an empty category list with an inline hint. Typecheck clean.

## 2026-08-19 – Bug Fixes: ADR-008 Ledger Netting, ADR-056 Addendum (Advance Debt Sync)

### Completed

* `deriveCycleInfo()` (`src/lib/ledger-state.ts`) summed `Math.abs(amount)`
  across cleared transactions for both `clearedSum` and `clearedPrev`, double-
  counting an ADR-008 correcting/reversal transaction instead of netting it
  against the payment it offsets. Replaced both with a signed net, floored at
  0. Regression test added in `ledger-state.test.ts` (a cleared payment
  followed by an equal cleared reversal now nets to `unpaid`, not `cleared`).
* ADR-056 addendum: `useCreateAdvance` only ever wrote `remaining_balance`,
  never `minimum_payment`/`next_due_date`. New `advanceMinimumPaymentPatch()`
  (`src/lib/payments.ts`) keeps `minimum_payment` mirroring `remaining_balance`
  for `debt_type='advance'` debts, merged into all 6 debt balance-writing
  sites. New `nextPayDate()` (`src/lib/paycheck-budget.ts`) defaults Next due
  date once for biweekly advance-type debts with none set, from the
  household's primary income source — never an ongoing resync.

### Notes

* Could not run the test suite locally (vitest blocked by AppLocker) —
  flagged for live verification.

## 2026-08-19 – ADR-071: Left-to-Allocate Fix (Amends ADR-059)

### Completed

* `obligationsTotal` in Paycheck Budget summed every `obligationsInRange()`
  row with no awareness of manually planned `pay_period_allocations` rows,
  double-subtracting a bill/debt that's both auto-matched in "Due this
  period" and separately planned for the same pay period. New
  `obligationsTotalExcludingPlanned()` (`src/lib/paycheck-budget.ts`) and a
  per-period `plannedKeys` set exclude those items' due-date amount from the
  aggregate total only — the "Due this period" list itself, "Planned" card,
  and ADR-060 recurrence projection are unchanged.

## 2026-08-19 – ADR-072: Optional Fee Amount on Planned Bill/Debt Allocations

### Completed

* `PayPeriodAllocation.fee_amount` (`src/lib/supabase.ts`), threaded through
  `useSetAllocation`'s new `feeAmount` arg and `commitPlanned`.
  `PlanPaymentDialog` (bill/debt-only) gained an optional Fee amount field;
  the Planned row shows "$total ($base + $fee fee)" when set, plain "$total"
  otherwise. `amount` keeps its existing total-outflow meaning, so ADR-071's
  math needed no changes.

### Notes

* SQL migration (`alter table pay_period_allocations add column
  fee_amount numeric(12,2)` + schema reload) run by the user.

## 2026-08-19 – TSP Loan Deduction Manual Backfill (data-only, no ADR)

### Completed

* Diagnosed why a DFAS paycheck marked received before its income source had
  `income_source_deductions` rows configured could never retroactively
  auto-post them: `useMarkIncomeReceived()`'s idempotency guard
  (`income-hooks.ts`) is keyed on any transaction already sharing the event's
  `split_group_id`, and a manual single-deposit transaction already existed
  for that event — closing the window permanently, with no in-app path
  (including "Post deposits") able to reopen it.
* Manually replicated both halves via Supabase SQL Editor: two deposit
  transactions matching the shape `useMarkIncomeReceived`/
  `deduction-funding.ts` would have written, and the two funded debts'
  cycle settlement matching `applyClearedPayment`'s debt branch by hand.
* Mid-correction, found and fixed a data error: both TSP debts' `billing_cycle`
  had been (re)set to `biweekly` — corrected to `monthly` with `due_day`,
  since monthly debts derive their displayed due date live from `due_day`,
  not `next_due_date`.

### Notes

* Known issue surfaced, not fixed: `computeArrears()` ignores `payment_status`
  for monthly debts, so a monthly debt cleared after its `due_day` has passed
  this month shows "1 cycle past due" regardless of being cleared. Worked
  around per-debt via `arrears_as_of`; see TODO.md follow-up.

## 2026-08-19 – Dashboard / Paycheck Budget UX Pass, Phase 1

### Completed

* Scoped from SCRATCHPAD.md's "Things to work on" — investigated each item in
  code and interviewed the user on open design decisions before implementing.
* Fix Places now excludes transfers, paycheck deposits, splits, and
  deductions (`transfer_group_id`/`split_group_id`) from the unassigned list,
  not just plain no-`institution_id` transactions.
* Dashboard hero: relabeled "$X set aside this pay period" → "$X due this pay
  period" (it never meant money set aside); added tooltips to Combined
  Spendable and the Bills/Debts tiles; split the one combined tooltip into
  two.
* `AppHeader` gained an optional `action` slot (backward compatible); new
  Paycheck Budget quick-link in the header plus a full-width card link under
  the hero.
* Past Due's Paycheck/HSA deduction grouping is now collapsible (collapsed by
  default, count + subtotal shown in the header).
* Fixed the "Aurora Audiology" bug: two independent "paid off" definitions
  existed — the Debts screen's `isPaidOff` (`remaining_balance <= 0`) vs.
  `obligationsInRange()`'s `date_paid_off` check, which only auto-sets inside
  `applyClearedPayment()`. Backfilled the one live debt in this state (date
  derived from its most recent linked transaction) and added the same
  derivation to the Debt edit form's `save()` so a manual balance edit can't
  cause this drift again.

### Notes

* No schema changes in this phase.

## 2026-08-19 – Dashboard / Paycheck Budget UX Pass, Phase 2 (ADR-073, ADR-074)

### Completed

* **ADR-073** — new "Monthly summary" Dashboard card (`src/lib/
  monthly-summary.ts`): bills + debts + spending combined per category for
  the current calendar month, compared against both the manual budget target
  and a trailing 6-month actual average. Debts enter category budget math for
  the first time (`debtsBudgetedByCategory()`, excludes paycheck-deducted
  debts per ADR-032). `BudgetSplitLines` gained optional `debtsBudgeted`/
  `debtsSpent` props, backward compatible with the existing "Budget vs
  actual" card.
* **ADR-074** — `usual_payment_account_id` added to `bills` and `debts`
  (schema change, SQL run by the user, backfilled from linked-payment
  history). New "Usual payment account" picker on both edit forms — an
  explicit pick wins, otherwise falls back to the most recent linked-payment
  account. New "Group: Category" and "Group: Account" modes (with subtotals)
  added to Paycheck Budget's "Due this period" toggle, alongside the
  unchanged Due Date default.

## 2026-08-19 – Read-Only Supabase MCP Connected

### Completed

* Connected a project-scoped, read-only Supabase MCP server (`docs`/
  `database`/`debugging`/`development` features, `read_only=true`) via
  `.mcp.json`. CLAUDE.md's workflow loop and "verify against live schema"
  rule updated: query the MCP directly instead of asking the user to run
  SELECTs. It cannot write — schema/data changes still require the user to
  run SQL manually in the Supabase SQL Editor.

## 2026-08-19 – Everything Page, Payment Date, Budget vs Actual Rescope

### Completed

* **ADR-036 addendum**: `deriveCycleInfo()` was 100% ledger-transaction-
  derived with no awareness of `remaining_balance`/`date_paid_off`, so a debt
  paid off any way other than through Hearthstone's own Submit/Clear flow
  read "Unpaid" forever on the Everything screen. Now overrides `state`/
  `remaining` to cleared/0 when a debt's `remaining_balance <= 0`, matching
  the Debts screen's own `isPaidOff` definition — a different code path than
  the Aurora Audiology fix.
* Submit/Clear payment dialog gained a date field: `PayInput.date`, threaded
  through `useMarkSubmitted`/`useMarkCleared`/`insertFeeTransaction`
  (previously always hardcoded to today).
* Add Transaction now auto-fills `"Bill/Debt payment · <name>"` when linked
  to a bill/debt and the description is left blank — never overrides typed
  text.
* Budget vs Actual card rescoped from calendar month to the current pay
  period. Discovered mid-implementation that `spending_budgets` has no
  `month` column at all (only `spending_actuals` does), so the manual budget
  target needed no change. New `actualByCategoryInRange()` (`src/lib/
  paycheck-budget.ts`, range-based, kept separate from `monthly-summary.ts`'s
  month-based version to avoid a circular import and protect Monthly
  Summary's own behavior) replaces the calendar-month ledger lookup;
  bills/debts target now uses real per-period due amounts instead of the
  monthly-equivalent smoothed figure; debts added to the card's breakdown for
  the first time; card relabeled "· this pay period" with a tooltip
  explaining the difference from Monthly Summary. Monthly Summary's own tile
  subheader swapped from "$X over/left" to "$actual of $expected" in the same
  pass.

### Notes

* No schema changes.

## 2026-08-20 – ADR-037 Addendum: Bill-Side Stranded Payment Repair

### Completed

* Found a bill-side variant of the ADR-037 stranded-payment bug: the
  Transactions screen's edit dialog let a linked transaction's amount/status
  be changed via plain `useUpsertTransaction()`, bypassing
  `applyClearedPayment()` — flipping a linked row to cleared there (instead of
  via the bill/debt's Pay actions) left `cycle_paid_to_date` stuck while the
  ledger showed the money cleared. Confirmed live on the "Beiers" bill.
* `TransactionDetail`'s edit form (`app.transactions.tsx`) now disables
  amount/status whenever the transaction is linked, with a note pointing to
  the bill/debt's own Pay actions or Reverse.
* New `src/components/StrandedBillRepair.tsx` (`findStrandedBillPayments` /
  `StrandedBillRepair`) mirrors the existing debt-side repair scan for bills,
  mounted on the Bills screen — flags a bill whose current-cycle cleared
  ledger sum exceeds `cycle_paid_to_date` and offers a delete-and-redo repair.

### Notes

* No schema change. Existing desynced bill rows (Beiers confirmed; Rent
  flagged for review, likely not actually broken) aren't retroactively fixed
  by the code change — use the new repair panel.
* Build/tests unverified locally (AppLocker blocks vite/tsc/vitest).

## 2026-08-20 – Bill Detail: Paying Account & Clickable Transaction Detail

### Completed

* Bill detail's "Recent transactions" rows (`RecentBillTransactions`,
  `app.bills.tsx`) now show a small account icon/label per row (reusing
  `ObligationIcon` at 16px, keyed off the transaction's `account_id` →
  account → institution) and are clickable to open the shared
  `TransactionDetail` dialog (already reused on the Accounts screen).
  Delete/Reverse buttons stop propagation so they don't also trigger the row
  click.

### Notes

* No schema change. Build unverified locally (AppLocker).

## 2026-08-20 – ADR-075: Persisted Cycle-Resolution Tag for Late Payments

### Completed

* Investigated a bug on the "Peacock" bill (surfaced after a StrandedBillRepair
  cleanup + manual re-entry of a late payment): the bill's underlying data was
  correct (due date rolled forward, `cycle_paid_to_date` 0), but the Bills page
  showed it "cleared" with a "Reset this cycle" button instead of offering
  Submit. Root cause: `deriveCycleInfo()` infers which cycle a linked
  transaction belongs to purely from date windows relative to the current due
  date — ambiguous for a payment made even one day late, which lands inside
  the same date range the freshly-rolled next cycle also uses. Two heuristic
  date-only fixes were explored and rejected (both break legitimate
  on-time/partial-payment cases).
* **ADR-075** — added `transactions.resolved_cycle_due_date` (nullable date,
  manual SQL). `applyClearedPayment` (`payments.ts`) now tags every cleared,
  linked, still-untagged transaction for a payable with the due date a
  resolve just advanced past — a bulk tag inside `applyClearedPayment` itself
  (catches direct-cleared-entry from Add Transaction and any stray earlier
  partials), plus an explicit tag on the row `useMarkCleared` writes itself
  (that write happens after `applyClearedPayment` returns). `deriveCycleInfo`
  now excludes any transaction tagged with a due date earlier than the
  payable's current due date from the "current cycle" window, regardless of
  its raw `transaction_date`.
* Added two regression tests in `ledger-state.test.ts` (tagged-exclusion case,
  and the untagged/historical-data baseline). `docs/SCHEMA.md` updated with
  the new column's own subsection.

### Notes

* Scoped fix only — does not touch `computeArrears`/arrears math or ADR-057's
  payment-allocation order; a bill/debt overdue by multiple cycles still
  resolves one cycle's due-date advance per payment, unchanged.
* Fix is forward-only, no backfill — existing untagged transactions (like
  Peacock's July payment) keep today's behavior until the current cycle's
  due date naturally passes.
* **Pending**: user must run `alter table transactions add column
  resolved_cycle_due_date date;` in the Supabase SQL Editor before this takes
  effect.
* Two related gaps found but not fixed, logged in `docs/SCRATCHPAD.md`: the
  "Total due" pay preset may double-count the current cycle's amount when
  that cycle is itself already overdue; there's no way to pay arrears only
  without also crediting the current cycle (by design, ADR-057).
* Build/tests unverified locally (AppLocker blocks vite/tsc/vitest).

## 2026-08-21 – ADR-076/077: Arrears-Only Payments & Correct This Payment (+ QA Pass)

### Completed

* **ADR-076 — Arrears-only payments.** New `priorCyclesArrears()` /
  `arrearsPaymentTag()` (`src/lib/arrears.ts`) compute arrears owed strictly
  before the current cycle, and the ADR-075 tag needed to exclude an
  arrears-only transaction from the current cycle's ledger window.
  `applyArrearsPayment()` / `useMarkArrearsPaid()` (`payments.ts`) + new
  `ArrearsPaymentAction.tsx`, wired into `PayActions.tsx` as "Log arrears
  payment" everywhere Submit/Reset already appear, hidden when nothing is
  owed from before the current cycle. Generalized `applyClearedPayment`'s
  overflow-into-arrears reduction to use `priorArrears` instead of raw
  `opening_arrears`, removing a gate that silently no-oped whenever arrears
  came purely from the live missed-cycle walk — this also fixed "Total due"
  overstating what's owed (the pay preset used the same formula).
  `applyClearedPayment`/`useMarkCleared`/`PayInput` all gained a
  `priorArrears` parameter computed by the caller (arrears.ts already
  imports from payments.ts, so the reverse import isn't possible); updated
  all 4 call sites (`pay-flow.tsx`, `AddTransactionFab.tsx`,
  `deduction-funding.ts`, `app.pending.tsx`).
* **ADR-077 — Correct this payment.** `useCorrectPayment` (`payments.ts`)
  edits a cleared, linked PARTIAL payment's amount/date/account in place via
  a `cycle_paid_to_date` delta; rejects anything that would cross a resolve
  boundary either direction, pointing at Reverse instead. New
  `CorrectPaymentButton.tsx` next to Reverse/Delete on Bills' and Debts'
  Recent Transactions. `StrandedBillRepair`/`StrandedDebtRepair` gained a
  "Credit now" action alongside "Clean up" — applies a stranded group's
  already-cleared total via `applyClearedPayment` instead of deleting the
  rows and asking for a redo.
* Also fixed while in this code: `computeArrears()` now trusts a monthly
  debt's `payment_status='cleared'` for its current cycle only when
  `updated_at` is recent enough to plausibly be for that cycle — closes a
  "cleared but still shows 1 cycle past due" gap without risking a stale
  flag hiding a genuinely overdue debt.

### QA pass (2026-08-21)

* Full test suite (Lovable sandbox): `arrears.test.ts` 13/13, then 24/24
  after the fix below; `ledger-state.test.ts` 10/10. Build OK.
* Live smoke test found and fixed a real bug: `arrearsPaymentTag()` returned
  the CURRENT due date whenever the current cycle was itself overdue (the
  arrears walk's first iteration reports it as `oldestMissedDate`), so an
  arrears payment read as a partial payment of the current cycle and also
  tripped the stranded-payment panel. `arrears.ts` now forces the tag
  strictly before the current due date. Re-verified live: button only
  appears with prior arrears, current cycle stays correctly unpaid, and
  sequential differently-dated arrears payments apply cleanly.
* Reviewed Lovable's own follow-up fix to the same function (`173c7ef`):
  behavior was correct, but removed a dead branch that could never execute
  (the arrears walk always starts at the current due date, so the
  "oldestMissedDate before dueDate" case is impossible) and fixed a test
  that passed for the wrong reason.
* Remaining 6 other smoke tasks all PASS, including a re-verify that
  ADR-066's advance-reactivation doesn't reproduce as a real bug (only a
  cosmetic stale "Cleared" chip until the next status write, logged not
  fixed).

### Notes

* No schema change for either ADR. Known issue found by QA, not fixed here
  (needed a real ADR decision — became ADR-078 below): the FIRST arrears
  payment on a payable whose current cycle is also overdue dropped that
  cycle's own amount from the past-due total.
* Pre-existing, non-regression TS2871 nullish-expression warnings noted in
  `monthly-summary.ts`/`paycheck-budget.ts`, logged for later cleanup.
* Build/tests unverified locally (AppLocker); verified in the Lovable
  sandbox instead.

## 2026-08-21 – ADR-078: `arrears_paid_to_date` Counter; ADR-079: `updated_at` Trigger

### Completed

* **ADR-078** — new `bills`/`debts.arrears_paid_to_date` running counter
  replaces ADR-076's original `opening_arrears`/`arrears_as_of` routing for
  arrears-directed credit, fixing the QA-found gap above: that mechanism
  could only suppress a PREFIX of the missed-cycle walk, the wrong shape for
  what ADR-076 needed to consolidate. `computeArrears()` now subtracts
  `arrears_paid_to_date` from the always-fresh raw total, floored at 0;
  `opening_arrears`/`arrears_as_of` are back to their original ADR-049
  one-time-carry-in-only meaning. Deliberately **no reset** of the new
  counter anywhere — traced the actual math before implementing (a normal
  cycle resolve only ever shrinks the raw walk by an amount always covered
  by `cycle_paid_to_date`, never overlapping what the counter tracks) after
  catching that the originally-drafted "reset on every resolve" clause would
  have wiped legitimate arrears credit almost immediately; corrected in the
  ADR text before writing any code.
* **ADR-079** — `set_updated_at()` Postgres trigger on `bills`/`debts`,
  found while diagnosing the Beiers bill below: neither table's `updated_at`
  had a DB trigger or any app code path setting it on UPDATE, so it was
  frozen at insert time forever. This silently undermined two "was this
  touched recently" checks built this session (the stranded-repair dedup
  guard, and ADR-077's monthly `clearedRecently` check) — both failed
  closed, not unsafe, just non-functional. Pure DB trigger, no app changes.
* Diagnosed the real Beiers bill's "Credit now" rejection via the read-only
  MCP: `cycle_amount_due` was null (missing an active $20 late-fee
  adjustment) and `next_due_date` had drifted a month ahead. Root cause
  logged as a real, separate, unfixed bug: `useResetCycle`/`useMarkUnpaid`
  write `cycle_amount_due: null` unconditionally, with no awareness of
  active `bill_adjustments`.
* All three pending SQL migrations (ADR-078, ADR-079, the one-time Beiers
  fix) confirmed run and verified live via the read-only MCP.

### Notes

* No schema change to `opening_arrears`/`arrears_as_of` themselves; new
  `arrears_paid_to_date` column (nullable numeric, default 0) on both
  tables.
* Known limitation, documented in ADR-078, not fixed (pre-existing ADR-076
  scope): `applyArrearsPayment` never touches `cycle_paid_to_date`, so a
  cycle paid off in advance via an arrears payment still offers Submit once
  its own due date becomes current.
* Build/tests unverified locally (AppLocker).

## 2026-08-21 – Stranded Repair: "Credit Now" Double-Credit Fix; Data Cleanup Sweep

### Fixed

* `StrandedBillRepair`/`StrandedDebtRepair`'s "Credit now" passed a
  stranded group's full `clearedSum` to `applyClearedPayment`, which treats
  its amount as NEW money layered on top of `cycle_paid_to_date` —
  double-crediting whatever portion of that window was already correctly
  credited. Only surfaced on the Rent (via Flex) bill, the first case with
  a PARTIALLY-credited window; every earlier case (Beiers, Prose, ATT) had
  `cycle_paid_to_date=0`, where the bug is invisible. Fixed both repair
  panels to credit `clearedSum - cycle_paid_to_date` instead; applied to
  the debt-side panel too for consistency even though it can't currently
  hit the bug.

### Completed

* Walked the user through the same `cycle_amount_due=null` root cause as
  Beiers on two more bills (Prose, ATT): one-time SQL to set
  `cycle_amount_due` to the real cleared amount, then "Credit now". Rent hit
  the double-credit bug above instead, so it got a direct SQL fix bypassing
  "Credit now" entirely (code fix not yet deployed at the time). All three
  confirmed cleared from the Stranded panel by the user.
* Corrected an earlier ad-hoc SQL sweep that had flagged ~15+ bills
  household-wide as potentially stranded: the user reported none actually
  show in the Stranded panel, and hand-tracing several against the real
  `findStrandedBillPayments()` window logic (rather than the oversimplified
  SQL query used originally) confirmed they're genuinely excluded, not a
  bug. Corrected `docs/TODO.md` instead of leaving a false lead.
* Diagnosed and fixed "SoFi - Invest": not a stranded-payment bug, but a
  genuine data-modeling error — a biweekly auto-transfer (savings → Robo
  investment account) tracked as a Bill, so it only ever debited savings
  and never credited the destination. Deleted a duplicate same-day $5
  debit, converted the remaining debit into a real transfer pair (paired
  credit into Robo via a shared `transfer_group_id`), deleted the SoFi -
  Invest bill row. Confirmed live via the read-only MCP.

### Notes

* Files touched: `src/components/StrandedBillRepair.tsx`,
  `src/components/StrandedDebtRepair.tsx`. No schema change for the
  double-credit fix; SoFi-Invest was pure data cleanup, no code change.
* Logged a real gap surfaced by SoFi-Invest, not scoped: Transfer mode
  (ADR-056) correctly double-enters money but has no recurrence/reminder
  attached the way Bills do — needs its own ADR if pursued
  (`docs/SCRATCHPAD.md`).

## 2026-08-21 – ADR-080: Overdue Items Stay in "Due This Period"; Paycheck Budget Status Icons

### Completed

* **ADR-080** — `obligationsInRange()`/`deductedObligationsInRange()`
  (`src/lib/paycheck-budget.ts`) now include a bill/debt whose due date has
  slipped before the period start too, as long as the period hasn't fully
  elapsed (`end > today`), so an overdue item keeps showing at its normal
  per-cycle amount every period until it's actually paid instead of only
  appearing in the separate Past Due section. Fixed at this shared level so
  both the Dashboard's "Still owed this period" and Paycheck Budget's "Due
  this period" pick it up from one change.
* Paycheck Budget's "Due this period" rows gained a status icon — green
  check (cleared), timer (pending), exclamation (partial) — shown only when
  the selected period is the current one. Reused the existing ADR-036
  `deriveCycleInfo()`/`LedgerState` machinery rather than a new status
  computation; pending/partial icons are tap targets (Popover, same pattern
  as `HelpButton`) showing the pending amount or the paid/remaining split.
* Fixed a duplicate-identifier typecheck error (TS2440) this introduced:
  `app.paycheck.tsx` had both an import of `todayISO` from
  `paycheck-budget.ts` and a pre-existing local function of the same name;
  removed the local declaration.

### Notes

* No schema change. Files touched: `src/lib/paycheck-budget.ts`,
  `src/routes/app.paycheck.tsx`. Dashboard has no equivalent per-row list to
  attach status icons to ("Still owed this period" is category-grouped, not
  itemized) — left as-is, not requested.
* User tested both pieces live and confirmed correct.

## 2026-08-21 – Accounts: Transfer Labels, Timezone Off-by-One Fix, Account Type Dropdown; Stash-Invest

### Completed

* Accounts & Balances' "Recent activity" list gained the same "Transfer"
  badge the Transactions screen already shows per-row; the shared
  `TransactionDetail` dialog now looks up a transfer's other leg by
  `transfer_group_id` and shows "From"/"To" account fields (sign of
  `amount` decides which, per ADR-056) instead of a single "Account" field.
* Account "Type" field (`AccountDialog`) changed from free text to a
  dropdown, same pattern as `InstitutionDialog`'s existing type picker.
  Queried live `account_type` values before building the list rather than
  guessing — found the real set is
  `checking`/`savings`/`credit`/`invest`/`retirement`/`hsa`/`lpfsa`, not
  `investment` as `visual-meta.ts`'s icon map assumed. Fixed that latent
  mismatch there (every invest/hsa/lpfsa account had been rendering the
  generic fallback icon) plus the same `investment`→`invest` mismatch in
  `balances.ts`'s `EXCLUDED_TYPES` and `snapshot.ts`'s `BALANCE_TYPE_ORDER`.
* Diagnosed and fixed "Stash - Invest" the same way as SoFi-Invest: a
  $5/paycheck auto-transfer into Stash's Personal Portfolio tracked as a
  Bill. Converted the one existing cleared debit into a real transfer pair
  and deleted the bill row (checked first for `bill_adjustments`/
  `pay_period_allocations` dependents — none). Confirmed live via the
  read-only MCP.

### Fixed

* Timezone off-by-one bug, reported as Accounts' Recent Activity showing a
  transaction dated one day earlier than entered (detail dialog showed the
  correct date, since it renders the raw string instead of parsing it).
  Root cause: `new Date("2026-08-15")` parses a date-only string as UTC
  midnight, which in any timezone behind UTC reads back as the prior local
  day. Same root cause was live in 4 places:
  * Display-only — swapped `new Date(x)` for date-fns' `parseISO(x)` (parses
    in local time): Recent Activity's date, the account balance snapshot's
    "as of" date (both `app.accounts.tsx`), and Debt detail's "Date paid
    off" (`app.debts.tsx`).
  * A real bug, not just display — `monthly-summary.ts`'s
    `combinedActualByCategory()` and `spending-actuals.ts`'s
    `buildActualResolver()` both built a month bucket via
    `monthKey(new Date(transaction_date))`, so a transaction dated the 1st
    of a month could silently land in the PREVIOUS month's Monthly Summary/
    Spending actuals. Fixed by slicing the date string directly instead of
    routing through `new Date()` at all, matching the string-slicing
    convention already used elsewhere for date-only comparisons.

### Notes

* No schema change, no ADR for any item in this entry (bug fixes and UI
  reuse of existing conventions, not new decisions). Files touched:
  `src/routes/app.accounts.tsx`, `src/routes/app.transactions.tsx`,
  `src/routes/app.debts.tsx`, `src/lib/monthly-summary.ts`,
  `src/lib/spending-actuals.ts`, `src/components/AccountDialog.tsx`,
  `src/lib/visual-meta.ts`, `src/lib/balances.ts`, `src/lib/snapshot.ts`.
* Build/tests unverified locally (AppLocker).

## 2026-08-24 – Auto-Transfer Tracking (ADR-081)

### Completed

* New `auto_transfers` table tracks recurring auto-transfers between the
  household's own accounts (e.g. SoFi/Stash biweekly investing sweeps) as
  their own item type, distinct from Bills and from ad-hoc Transfers.
  Mirrors `bills`' scheduling fields (`next_due_date`, `billing_cycle`,
  `cycle_interval_days`, `is_active`) plus `from_account_id`/
  `to_account_id`/`amount`/`category_id`, but has no arrears/partial-payment
  columns — an auto-transfer either processed this cycle or it didn't.
  `transactions.linked_auto_transfer_id` tags only the credit (destination)
  leg of the transfer pair a "Process transfer" action writes, letting the
  existing ledger-state pattern work the same way it does for a bill's
  single-sided payment. SQL migration run and verified live 2026-08-24.
* New `src/lib/auto-transfers.ts`: `deriveAutoTransferState` (a stripped-down
  `deriveCycleInfo` producing only unpaid/cleared — no partial/pending),
  `useProcessAutoTransfer`/`useUndoAutoTransferProcess` (writes/undoes an
  ADR-056 transfer pair), `isAutoTransferOverdue`. Deliberately a parallel,
  dedicated module rather than a 3rd `PayableKind` threaded through
  `payments.ts`/`ledger-state.ts` — that machinery turned out to be deeply
  bill/debt-specific (ternaries throughout for arrears/partial/pending/fee
  logic that doesn't apply here), so a sibling module was the smaller,
  safer change.
* `src/lib/data-hooks.ts` gained `useAutoTransfers`/`useUpsertAutoTransfer`/
  `useDeleteAutoTransfer` CRUD hooks, mirroring the existing bill hooks.
* `src/lib/paycheck-budget.ts`: `Obligation.kind` gained `"auto_transfer"`;
  `obligationsInRange()` gained an `autoTransfers` parameter and a loop
  reusing the existing due/overdue-window and forward-projection logic
  unchanged, so auto-transfers inherit ADR-080's "stays due every period
  until processed" behavior and ADR-060's forward projection for free.
* Bills screen (`app.bills.tsx`) gained a new "🔁 Auto-Transfers" section
  below the Bills list: a two-state Process/Undo button (no amount prompt,
  fixed amount only) and an Add/Edit dialog. Overdue auto-transfers show a
  soft amber "Check on this" badge instead of the red past-due-money styling
  bills/debts use, since nothing is actually owed to a vendor — the transfer
  already happened at the bank, the app is just unconfirmed.
* Paycheck Budget (`app.paycheck.tsx`) picks up auto-transfer obligations in
  "Due this period" (all three group modes — due/category/account), tagged
  "🔁 Auto-transfer" in the row subline.
* Dashboard (`app.index.tsx`) hero card gained a third "🔁 this {period}"
  tile, and a new standalone "Auto-Transfers" card (kept separate from
  Bills/Debts "Still owed"/"Past due" language) lists unprocessed
  auto-transfers with a 3-day "due soon" highlight and the same soft
  "Check on this" flag when overdue.

### Notes

* Scoped from last week's SoFi-Invest/Stash-Invest cleanup, which converted
  the existing mis-modeled Bill rows into one-off Transfer pairs but left no
  ongoing way to track the recurring transfers going forward (logged as an
  unscoped idea in `docs/SCRATCHPAD.md`, now removed as scoped/implemented).
* Not yet build-verified or end-to-end tested (Windows AppLocker blocks
  local `vite`/`tsc`; the Supabase MCP is read-only so no test data could be
  written from this side) — flagged in `docs/TODO.md` for the user to
  smoke-test in the browser.

## 2026-08-24 – Dashboard Overdue Bug & OnePay Advance Data Fix

### Fixed

* Dashboard's "Past due" section listed debts that were actually paid off
  (Student Loan 1 and Student Loan 2, confirmed live via the read-only MCP).
  Root cause: the `overdue` array's `isDateOverdue(...) ? debtRemainingOwed(d)
  : 0` fallback only checked `payment_status`, not `remaining_balance` —
  `computeArrears()`'s primary path already excludes a paid-off debt, but a
  debt paid off with a stale `payment_status: "unpaid"` still fell through
  the `||` into the fallback and reported its full minimum payment as
  overdue. Added the same `remaining_balance <= 0` guard `computeArrears()`
  already uses (`src/routes/app.index.tsx`).
* `applyClearedPayment()` (`src/lib/payments.ts`) set `date_paid_off =
  todayISO()` — today's real date — whenever a payment zeroed a debt's
  balance, instead of using that payment's own (possibly backdated) date.
  Found while diagnosing why "OnePay Advance" showed as paid off with
  `date_paid_off` stamped today even though the payment that triggered it
  was dated over a week earlier. Added an optional `date` parameter
  (defaults to today, backward compatible), threaded through from
  `useMarkCleared()` and `AddTransactionFab.tsx`'s direct-clear path.

### Completed

* Added a non-blocking warning (`src/routes/app.debts.tsx`'s
  `DebtAdjustments` component) when a new debt adjustment or advance's date
  is older than that debt's most recent existing entry — `confirm()`
  dialog, same convention as other confirm-before-proceeding actions in
  this codebase. Guards against the underlying cause of the OnePay Advance
  incident: every debt-balance mutation applies against the live balance at
  click-time, not a chronological replay, so backfilling history out of
  date-order silently produces a wrong balance.
* Data correction (read-only MCP diagnosis + user-run SQL, no schema
  change): `OnePay Advance` had drifted to `remaining_balance: 0.00`,
  `date_paid_off` stamped today, from exactly this out-of-order-backfill
  issue. Confirmed with the user an advance-type debt can never have more
  than one open advance at a time (must pay one off before requesting
  another), so the single-running-balance model is correct as-is — no
  schema/architecture change needed, just a data fix. Corrected to
  `remaining_balance = 231.75`, `minimum_payment = 231.75`,
  `date_paid_off = null`; confirmed live via the read-only MCP.

### Notes

* No ADR for any item in this entry — bug fixes, not new decisions future
  devs need to be told about (the data correction is one-off cleanup, same
  pattern as the SoFi-Invest/Stash-Invest cleanup).
* Not yet build-verified locally (AppLocker).

## 2026-08-25 – Mobile Layout Fixes

### Fixed

* The floating "+" Add button covered real content (the last row or button)
  on nearly every screen — Bills, Debts, Institutions, Transactions,
  Dashboard — confirmed from 8 real-Android-phone screenshots traced back
  to actual layout code (the viewport meta tag was already correct, so this
  wasn't the classic missing-viewport bug). Root cause: `src/routes/app.tsx`'s
  `AppLayout` only reserved 6rem of bottom padding — enough for `BottomNav`
  — but the FAB sits 6rem up and is itself 3.5rem tall, so its footprint ran
  6rem-9.5rem up, outside the reserved padding. Bumped to
  `pb-[calc(10rem+env(safe-area-inset-bottom))]`. One line, fixes it
  everywhere at once since the FAB/nav are mounted once in the shared layout.
* Dashboard's "Budget vs actual" and "Monthly summary" category tiles
  truncated long names ("Finan...", "Entert...", "Busin...") — the
  `grid-cols-2` tile layout only left ~66px for text after the 44px
  `ProgressRing`. Per the user's choice (keep the ring, drop the 2-column
  grid), switched both to single-column full-width rows (`space-y-2`
  instead of `grid grid-cols-2`), adding `w-full` to the tile buttons since
  they'd relied on CSS grid's implicit stretch.

### Completed

* Small uppercase "eyebrow" labels bumped up one notch app-wide
  (`text-[10px]`→`text-[11px]`, `text-[11px]`→`text-xs`) for legibility on a
  real device — `src/components/SectionLabel.tsx` plus 62 other occurrences
  across 12 route/component files, done as targeted substring replacements
  rather than reviewing every line, since it's a pure font-size swap.
  Deliberately skipped non-uppercase small text (tabular-nums detail rows,
  badge chips, a fixed-width ring number, the dev-only ThemeTokenPreview
  screen) where bumping risked new overflow instead of fixing legibility.
* Debt Strategy's 4-column scenario table (Scenario/Avalanche/Snowball/
  Custom) was already correctly wrapped in `overflow-x-auto` — the "Custom"
  column is reachable by swiping, just wasn't discoverable. Added a "Swipe
  the table left to see the Custom column →" caption.

### Notes

* No ADR — pure CSS-class/layout fixes, no schema/logic change.
* Not yet build-verified locally (AppLocker); needs a real-phone re-check.

## 2026-08-25 – Budget Visualization Overhaul

### Completed

* Zero-budget category label fixed: when `budgeted === 0` and actual spend
  is positive, Dashboard "Budget vs actual" tiles and Spending category rows
  now read "$X spent" (destructive color) instead of the confusing "$-X left".
* Budget split lines (Dashboard "Budget vs actual" + Monthly Summary,
  Spending screen) now label themselves: a "Paid / due · tap a line for
  detail" caption, bills/debts rows read paid/due with the denominator
  floored at the paid amount (a fully-paid bill no longer shows "$7.33 /
  $0.00"), and each row is tappable to reveal total due/budgeted, total
  paid/spent, remaining/available, and pending for the pay period
  (`src/components/BudgetSplitLines.tsx`).
* Pay-period budget math now separates cleared from pending: `budgetChart`
  in `src/routes/app.index.tsx` computes actuals from cleared transactions
  only and carries pending per split (spending/bills/debts) for the new
  detail rows.
* New shared `budgetRingColor()` (`src/components/viz.tsx`) replaces the
  rotating palette on every budget ring: green under 80%, amber 80-99%,
  blue at exactly 100% (new `--budget-complete` token in `src/styles.css`,
  light+dark), destructive/orange when over budget or when spend exists
  with no budget at all. Applied to Dashboard budget tiles, Monthly Summary
  tiles, and Spending category rows — presentation only, no schema/ADR.
  * Follow-up: the group-level ring used the same zero-denominator quirk (a
    fully-paid bill leaves the "due this period" scan), so a category whose
    only activity was a paid bill rendered orange/100%. `budgetChart` now
    floors each category's bills/debts expected amount at the amount
    actually paid, so paid-in-full correctly reads blue (exactly 100%).
* Split-line bars now use the same `budgetRingColor()` instead of a flat
  brand blue, so an over-spent line reads orange and a partly-paid line
  reads green/amber rather than "complete" blue; over-detection also covers
  the zero-denominator (spend-with-no-budget) case.
* Budget split-line progress bars render pending amounts as a yellow/amber
  segment at the end of the filled bar (`ItemBar` in `src/components/viz.tsx`)
  — cleared spending/bills/debts use the budget-state color, any pending
  portion shows in `var(--state-pending)` so it's visible without tapping
  the detail row.
* Deduction-funded obligations (payroll/HSA, ADR-032/068) were rendering as
  $0.00 rows on the Dashboard budget breakdown despite being excluded from
  budgeting math. Now computed separately and shown as a "Deducted (payroll
  / HSA)" split line — informational only, the figures never feed
  `budgeted`/`actual`, so ring percentages are unchanged
  (`src/routes/app.index.tsx`, `src/components/BudgetSplitLines.tsx`).
* Dashboard budget tile rings are now a fuller status indicator: include
  deduction-funded obligations in the paid/due math, and `ProgressRing`
  gained a `pendingValue` amber arc so pending shows as partial progress
  (budget labels below the ring unchanged).

### Notes

* Presentation/derivation-logic only — no schema or ADR change; also fixed
  a typecheck error on `ItemBar`'s optional `pendingValue`.
* Not yet build-verified locally (AppLocker).

## 2026-08-25 – Bills List Card Redesign

### Completed

* Bills list card redesign (`src/routes/app.bills.tsx`): category shown as
  a colored icon chip, billing cycle removed from the row (still on the
  detail view), amount moved inline with the name, tighter icon/padding for
  better use of narrow screens.
* Bills list status chips (Pending/Unpaid/Cleared) now always render on
  their own dedicated line below the due-date/category metadata, so status
  is scannable in a consistent location on every card.

### Notes

* Presentation only — no schema or ADR change.
* Not yet build-verified locally (AppLocker).

## 2026-08-26 – Codespace Verification, TODO Batch, ADR-082

First session with working build/test verification (GitHub Codespace — `tsc`,
`vite build`, `vitest` all runnable). Worked through the TODO backlog.

### Tooling / environment

* Established a green baseline: `npx tsc --noEmit` clean, `npm run build`
  succeeds, `npx vitest run` all green. Test suite grew 28 → 77.
* `.devcontainer` `postCreateCommand` changed `npm install` → `npm ci`. Root
  cause of the vitest "cannot find native binding" failure was npm's
  optional-deps bug (npm/cli#4828) running `npm install` against a
  pre-populated `node_modules` and skipping `@rolldown/binding-linux-x64-gnu`;
  the lockfile itself was already correct, and `npm ci` (clean tree) installs
  it fine.
* Regenerated `src/routeTree.gen.ts` with the current `@tanstack/router-plugin`
  and committed it — the tracked copy predated any environment that could run
  vite, so every build re-sorted its route declarations. Pure reordering.

### Added

* `src/lib/paycheck-budget.test.ts` — 13 tests for `projectOccurrences()`
  (ADR-060): monthly + biweekly, never-returns-stored-due-date, throughDate
  inclusivity, empty-window, unset-cycle→monthly, one-time skip, missing
  from-date, time-component slicing, custom-by-interval, custom-without-interval
  → empty, quarterly, and a month-end-clamp characterization test.

### Fixed

* **Re-advanced advance debt kept a stale "Cleared" chip** (ADR-066). New pure
  `advanceReactivationPatch(debt)` in `src/lib/payments.ts` resets
  `payment_status`/`cycle_paid_to_date` alongside `date_paid_off` when a
  paid-off advance-type debt is reactivated; wired into `useCreateAdvance`.
  Covered by `src/lib/payments.test.ts` (also backfills tests for the
  previously-untested `advanceMinimumPaymentPatch`).
* **Cycle reset silently dropped bill adjustments** — the Beiers "Credit now"
  bug (ADR-058 2026-08-26 addendum). `useResetCycle` and `useMarkUnpaid` wrote
  `cycle_amount_due: null` unconditionally. New pure
  `rebuiltCycleAmountDue(bill, adjustments, dueDate)` + `fetchBillAdjustments()`
  in `src/lib/payments.ts` rebuild it from `bill.amount` + the sum of
  `affects_balance` adjustments dated within the restored cycle (one-interval
  band around the due date, `deriveCycleInfo`-style half-open window). Returns
  `null` (→ old behavior) for a plain bill / variable bill / read failure.
  "Resolved" resets anchor the band on the reversed due date. No schema change.
  12 unit tests.
* **Auto-transfer "Process transfer" write order** (ADR-081 2026-08-26
  addendum). `useProcessAutoTransfer` now writes both transfer legs before
  advancing `next_due_date` (was: date first) — a failed date advance leaves a
  complete, correctly-tagged pair that reads as "cleared" instead of a
  silently-skipped cycle plus an orphan debit.

### Changed

* **ADR-038 addendum — warn on a repeat same-month Set Aside.** New pure
  `priorSetAsideThisMonth()` in `src/lib/format.ts`; `SetAsideAction` shows a
  `confirm()` before writing when this bill's envelope already got a Set Aside
  this calendar month. Never blocks — a top-up/correction is legitimate. 8
  tests. No schema change.

### ADR-082 — Explicit Deduction Kind; Three-Way Past Due Grouping

* Migration run + verified live: `income_source_deductions.kind text not null
  default 'payroll'`, CHECK `('payroll','hsa','fsa','other')`; backfill from the
  old name heuristic (HSA → hsa, LPFSA → fsa, the other 22 → payroll).
* `DeductionKind` type + `IncomeSourceDeduction.kind` in `src/lib/supabase.ts`.
* `pastDueGroup()` + `deductionFundingLabel()` pure helpers in
  `src/lib/deduction-funding.ts` (11 tests) — `kind` is now the single source
  of truth, replacing a `/hsa|fsa/` regex on the destination account name.
* "Kind" picker (Payroll / HSA / FSA / Other) on the income-source deduction
  dialog (`src/routes/app.income-source.$id.tsx`).
* Dashboard "Past due" is now three-way: one collapsible "Auto-handled off
  paycheck" section with "Paycheck deduction" and "HSA / FSA" sub-lists, plus
  the ordinary "Other" list. Deduction-funded *bills* (via
  `funding_deduction_id`, ADR-068) now group with the deductions instead of
  falling into "Other".

### ADR-081 auto-transfer code-review follow-ups (findings 2, 4, 5, 6)

* **"Processed / Undo" never appeared after processing (finding 6, the real
  bug).** Processing tags the credit leg with the cycle it closed (one interval
  back); `deriveAutoTransferState`'s `eligible` filter drops any leg tagged
  earlier than the current due date, so a just-processed transfer flipped
  straight back to "unpaid" and could be re-processed. Fixed the resolved-cycle
  lookback: fires while `today < next_due_date`, matches the exact tag against
  `linked`. Surfaced by the first unit tests for the module
  (`src/lib/auto-transfers.test.ts`, 10 tests).
* **Server-side double-process guard (finding 2)** — `useProcessAutoTransfer`
  rejects if a cleared leg already tags this exact cycle.
* **Deterministic undo (finding 5)** — `useUndoAutoTransferProcess` targets the
  leg for the cycle `next_due_date` was advanced past, not most-recent-by-date.
* **Paused auto-transfers (finding 4)** — `is_active = false` rows show a
  dimmed "Paused" card with no Process button in the Bills list.
* Suite 77 → 87. ADR-081 2026-08-26 addendum. No schema change.

### Verified (no code change)

* 2026-08-24 fixes checked against live data via the read-only MCP: the
  Dashboard overdue `!paidOff` guard correctly zeroes Student Loan 1 & 2 (each
  would otherwise show $50); OnePay Advance shows its open $231.75; the
  `applyClearedPayment` date threading and the out-of-order backfill warning are
  present and wired.

### Notes

* `npm run lint` still fails (~489 errors on `main` too) — all pre-existing
  `prettier/prettier` formatting on Lovable-generated code. A repo-wide
  `npm run format` pass was deferred (needs a `.prettierignore` scoping it to
  `src/` first — a bare `prettier --write .` also reformats the skill/agent
  docs).
* `.devcontainer/devcontainer.json` was malformed JSON (the `features` block
  sat outside the object), so Codespaces silently fell back to its default
  image. Fixed — kept the working default (node 24), dropped the broken pins.
* Nothing on this branch has been clicked through in a real browser yet;
  verification is typecheck + 87 unit tests + code review.

## 2026-08-26 – ADR-083: RLS-Bounded Test-Database Writes

Automated/E2E tests may now create and mutate data, but only inside "TEST
Household — Lovable QA" — enforced by Postgres RLS, not convention.

### Added

* `scripts/test-db.mjs` — `testClient()` signs in as the RLS-bound
  `+lovabletest` user, asserts it belongs to exactly one household and that the
  real household is invisible, then returns the client. `inTestHousehold()`
  stamps/asserts `household_id`.
* `scripts/test-db-preflight.sql` — MCP checks to run before any writing test
  session.
* `scripts/migrations/2026-08-26-rls-hardening.sql` — Part 1 enables RLS on
  `auto_transfers` (shipped in ADR-081 with RLS *disabled* — a live bug);
  Part 2 sets `force row level security` on all 24 public tables.
* `.env.test` (gitignored) holds the test-user creds.

### Changed

* CLAUDE.md gained a "Testing against the database" hard-rule section.
  Load-bearing rule: Claude must never be given the `service_role` key or a
  direct `postgres` connection string (both bypass RLS).
* Docs: ADR-083, ADR-081 addendum (auto_transfers RLS), SCHEMA.md RLS section.

### Verified

* Boundary proven live: INSERT into "Our Household" → `42501` RLS rejection;
  UPDATE → 0 rows. `authenticated` has `rolbypassrls = false`.
* Migration run + re-verified: 0 tables without RLS, 0 without FORCE,
  `auto_transfers` policy present, `is_household_member` SECURITY DEFINER still
  resolves under FORCE.
* The `+lovabletest` password was rotated off a value that had appeared in a
  transcript (`updateUser({currentPassword})` with the anon key; new 32-char
  random into `.env.test`; old value now rejected).

## 2026-08-26 – ADR-084/085/086: Debt Payment Logging & Debt-Detail Cycle Accuracy

Done in Lovable; recorded here for continuity.

### ADR-084 — Log a payment to this debt

* New `useLogDebtPayment()` + `isWithinCurrentCycle()` /
  `debtCycleWindowStart()` in `src/lib/payments.ts`; `feeCategoryId()` helper
  extracted from `insertFeeTransaction`.
* New `src/components/LogDebtPaymentDialog.tsx`, rendered under `PayActions` on
  `src/routes/app.debts.tsx`. One form: date, paying account, principal,
  status, and any number of fee/interest lines.
* Date-driven: a date inside the current cycle → normal `applyClearedPayment()`
  path; an earlier date → historical backfill that only reduces
  `remaining_balance` and writes the ledger row. Only principal moves the debt
  balance; each fee/interest line posts its own transaction against the paying
  account (no interest engine). No schema change.

### ADR-085 — Debt detail reads ledger-derived cycle state

* "Payment status", "Paid this cycle" and "Still owed this cycle" now come from
  `deriveCycleInfo` (ADR-036) rather than the raw `payment_status` /
  `cycle_paid_to_date` columns, which showed "pending / $0 paid / $106.30 owed"
  the day after a monthly cycle was fully paid. A disagreeing stored value
  shows as a small "stored: …" note.
* `CycleInfo` gained `windowStart` / `windowEnd`; new "Cycle window" and "Pay
  period" fields on the detail panel.
* Addendum: "Cycle window" shows the real billing period (one cycle back from
  the effective due date), with the narrower derivation range as a sub-line. A
  "Sync stored status" button (`useSyncStoredStatus()`) writes the derived
  state back onto the debt row when it disagrees.
* Files: `src/lib/ledger-state.ts`, `src/lib/auto-transfers.ts`,
  `src/lib/payments.ts`, `src/routes/app.debts.tsx`.

### ADR-086 — Monthly cycles are the calendar month

* In `deriveCycleInfo`, a monthly bill/debt's cycle is the calendar month
  containing today — every linked transaction dated in that month counts, early
  or late, and the cycle resets on the 1st. The ADR-075
  `resolved_cycle_due_date` tag is compared by month for monthly items.
* Non-monthly cycles (biweekly / weekly / custom / one-time) keep the existing
  `next_due_date`-anchored rolling window unchanged. `CycleInfo.resolved` is
  still set for a cleared monthly cycle whose `next_due_date` has rolled past
  month-end.
* Rationale: a drift check across 42 debts found 4 rows whose `next_due_date`
  day no longer matched `due_day`, producing nonsense windows and cleared
  on-time payments reading as unpaid. `bills` has no `due_day` column, so the
  calendar month is the one rule both tables can express.
* Files: `src/lib/ledger-state.ts`, `src/lib/ledger-state.test.ts`,
  `src/routes/app.debts.tsx`. 88 tests green. No schema change.

## 2026-08-27 – ADR-087: Hybrid Task Tracking; README Rewrite; Test Tooling

### ADR-087 — Hybrid task tracking (GitHub Issues/Milestones + docs/)

* Drafted as ADR-084, renumbered after `main` landed its own ADR-084/085/086.
* Open, actionable work → GitHub Issues; phases → Milestones; small label set
  (`schema`, `ledger`, `mobile`, `verification`, `tech-debt`). `docs/` stays
  the source of truth for ADRs / context / schema / architecture / changelog.
* Created: labels, Milestones Phase 12–14, Issues #4–#10 migrated from the old
  `docs/TODO.md`. `docs/TODO.md` repurposed to working-as-designed limitations
  only. `CLAUDE.md` updated (tasks → Issues, phases → Milestones, `Closes #N`
  in PRs).

### README rewrite

* Full rewrite — the old one claimed "Phase 2", said changes happen "in the
  Lovable editor, not by hand-editing this repo", and documented `.env` vars
  the code no longer uses. Now: current feature summary, real stack, the
  Codespace dev flow, a docs table, the ADR-083 testing note, a private-repo
  privacy section.
* Repo visibility flipped to **private** by the user.

### Test tooling

* `package.json`: added `test` / `test:watch` / `typecheck` scripts (`npm test`
  → `vitest run`).
* `vitest.config.ts` added — Vitest had no `include`, so `vitest run` globbed
  the whole tree (including the `.trunk/` plugin cache) and reported ~190 bogus
  failed test files. Now scoped to `src/**/*.test.ts`, node env, native
  `resolve.tsconfigPaths` for the `@/` alias. `npm test`: 7 files / 88 tests,
  ~3s (was ~37s).

### Notes

* PR #12 (`vitest.config.ts`) merged into the feature branch a minute after
  PR #11 had already merged that branch to `main`, so it missed `main`;
  re-landed via PR #13.
