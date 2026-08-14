# Add Transaction refinements + Fix Places screen

Implements ADR-062, ADR-063, ADR-064. No new ADRs, no schema changes.

## Current state (verified)

1. **Status** — `AddTransactionFab` hardcodes `status: "cleared"` on both the single-expense and split paths. There is no status control in the dialog at all.
2. **Date** — the dialog has no date field; it always sends `todayISO()`. Elsewhere the app uses a plain `<Input type="date">` (bill next due date, snapshot "As of", adjustments "Date") — that is the established date pattern, not the shadcn calendar popover.
3. **Fix screen** — none exists for transactions missing a place. The only repair scan is `StrandedDebtRepair`, rendered inline on the Debts screen: a bordered `Card` with an `AlertTriangle` header, per-item rows, and it renders nothing when the scan is clean.
4. **Place vs Description** — one Description input drives everything: merchant autocomplete matches on the typed description, picking a suggestion overwrites the description, and inline "new place" creation uses the description text. Place and note are entangled.
5. **Transfer category** — `useSaveTransfer` writes both rows with no `category_id`; Transfer mode has no category picker. The mutation accepts only from/to/amount/description/date.

## Changes

### Shared place picker
Extract the existing merchant search / suggestion chips / inline-create logic from `AddTransactionFab` into `src/components/PlacePicker.tsx` (props: `value: string | null`, `onChange`). Behavior and storage unchanged — same matching, same `useUpsertInstitution` with domain-guessed logo. It gets its own search text state so it no longer piggybacks on Description.

### Add Transaction dialog
- Default status `pending`, with a user-editable Expense/Split status control (Pending / Cleared segmented pair, matching the existing mode tabs styling). Applies to both single and split submits only.
- New Date field, `<Input type="date" className="h-12">` defaulting to today, used as `transaction_date` for expense, split, and transfer submissions.
- Description becomes a plain optional note; Place uses the new `PlacePicker`.
- Transfer mode gains an optional category picker reusing the existing large icon-based category `Select` markup (colored emoji tile + colored name, `h-12`/`py-3` rows).

### Transfer category plumbing
`useSaveTransfer` accepts optional `categoryId` and includes `category_id` on both inserted rows (via the existing `saveWithOptionalColumns` base object). Pending/cleared behavior for transfers unchanged.

### Fix Places screen
New route `src/routes/app.fix-places.tsx` ("Fix Places"), linked from the More grid. Lists transactions with `institution_id == null`, newest first, showing date / description / amount / account, each row with a `PlacePicker` that assigns the institution on selection via the existing transaction update hook. Uses the StrandedDebtRepair visual pattern: warning-styled card header with a count, and a clean-state message when nothing is unassigned.

Transfer rows and rows already linked to a bill/debt are still listed — assignment is purely additive.

## Files
- new: `src/components/PlacePicker.tsx`, `src/routes/app.fix-places.tsx`
- edit: `src/components/AddTransactionFab.tsx`, `src/lib/data-hooks.ts` (`useSaveTransfer`), `src/routes/app.more.tsx`
- docs: append to `docs/SESSION.md`; mark ADR-062/063/064 Implemented in `docs/DECISIONS.md`; note the Fix Places screen in `docs/ARCHITECTURE.md`
