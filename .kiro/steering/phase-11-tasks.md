# Phase 11 Tasks

Work groups below can land independently. Do them roughly in this order —
later groups depend on schema/logic earlier groups touch.

## 0. Prerequisite (blocks groups 2, 3, 4, 5)
ADR-055..058 must be approved and `SCHEMA_MIGRATION_PHASE11.sql` actually run
in Supabase before implementing those groups. Group 1, 6, 7, 8 don't need new
schema and can start immediately.

## 1. Bug fixes (start here — no schema needed)
- **New-institution insert fails on Add Transaction (ADR-053).** Picking an
  existing place works; creating one inline fails. Diagnose as: check the
  insert payload includes `household_id` and whatever `institutions` requires
  (`institution_type` has a not-null check — confirm the inline-create path
  sets a default like `'other'`, and doesn't silently omit it). Surface the
  real Supabase error in the UI instead of swallowing it, so the actual
  constraint violation is visible next time.
- **Overdue not reduced by payment** — this is Group 4/ADR-057, not a
  standalone fix; don't patch it separately.

## 2. Income: deductions, splits, auto-post (needs ADR-055)
- Build `income_source_deductions` CRUD (Income source detail view, alongside
  existing Splits section).
- Extend `useMarkIncomeReceived` (ADR-047) to also write one deposit per
  deduction with a `destination_account_id`, sharing the pay event's
  `split_group_id`. Deductions with no destination account: skip the
  transaction, still show in the gross/net breakdown.
- Stats line: show gross (net + Σ deductions) alongside existing net figures.
- New pay dates: auto-post on save instead of requiring the manual "Post
  deposit" button; keep that button for backfilling old dates.

## 3. Transfers and advances (needs ADR-056)
- Add Transfer mode to Add Transaction: from-account, to-account, amount →
  two transactions sharing `transfer_group_id`.
- Add Advance flow: pick a debt + destination account → deposit transaction
  (transfer_group_id set) + a `debt_adjustments` row
  (`adjustment_type='advance'`, positive amount).
- Delete: removing one side of a transfer/advance removes its pair.

## 4. Overdue-aware payments (needs ADR-057 — test carefully)
- Pay dialog: 3 presets (Owed this cycle / Total due / Other amount).
- Payment allocation: current cycle first, overflow reduces
  `opening_arrears` and advances `arrears_as_of` to the payment date.
- Verify against `src/lib/arrears.ts` unit tests — add a case for a
  multi-cycle-behind bill paid via "Total due," confirming the missed-cycle
  count (not just the dollar figure) drops to 0.

## 5. Fees and adjustments on bills (needs ADR-058)
- Bill detail gains an Adjustments section (reuse the debt detail one's
  component/pattern, backed by the new `bill_adjustments` table).
- Both bill and debt adjustment forms gain an "Affects balance" toggle.
  `affects_balance = false` still records the row but skips the
  balance/cycle update.

## 6. Spending screen — more graphical
- Category rows: compact bar (icon, color, spent/budget, progress fill),
  numbers on the bar instead of separate lines.
- Add a donut/stacked share-of-spending chart at the top of the month view.
- Keep the existing month navigator; add a card linking to Spending by place.

## 7. Filtering, grouping, drill-down
- Transactions screen: sort (date/amount/name), group (day/category/
  account/place), filter (date range, category, account, place, status,
  linked/unlinked).
- Dashboard and Spending cards become tappable, deep-linking to Transactions
  pre-filtered to that category/budget item.
- Let an existing transaction be re-tagged with a place from the
  Transactions screen (closes the standing TODO item).

## 8. Remaining cleanup
- Share the Institutions and Accounts detail dialogs (only add/edit forms
  are shared today — see `docs/ARCHITECTURE.md`'s shared-dialogs note).

## Docs to update as groups land
`docs/SESSION.md`, `docs/SCHEMA.md`, `docs/ARCHITECTURE.md`,
`docs/DECISIONS.md` (mark ADR-055..058 Implemented once done),
`docs/CHANGELOG.md`. `docs/TODO.md`: remove closed items, keep it as an
open-items list only.
