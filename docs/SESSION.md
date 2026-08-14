## Session Notes

### 2026-08-14
- Implemented ADR-062/063/064 in the Add Transaction dialog: manual entries now
  default to `pending` with a user-editable Pending/Cleared toggle (bill/debt
  payments, income deposits and transfers keep their own status rules); added an
  editable Date field defaulting to today (plain `<Input type="date">`, matching
  bill due dates); split Description into a separate Place picker plus a
  free-text note; Transfer mode gained an optional icon-based category picker
  applied to both rows of the pair. (`src/components/AddTransactionFab.tsx`,
  `src/lib/data-hooks.ts` `useSaveTransfer`)
- Extracted the institution search / inline-create logic into a reusable
  `src/components/PlacePicker.tsx` (behavior and storage unchanged).
- New "Fix Places" screen (`src/routes/app.fix-places.tsx`, linked from More):
  lists every transaction with a null `institution_id` and assigns a place per
  row via the same PlacePicker, using the ADR-037 repair-scan card pattern with
  a clean state when nothing is unassigned.
- Fixed invoice payments not updating status on Everything: `deriveCycleInfo()`
  windowed linked transactions to (next_due_date − 1 cycle, today]. One-time
  invoice cycles never shift, so that window was empty and every payment fell
  outside it — state stayed "unpaid" even though the write succeeded. One-time
  payables now use all linked transactions as their single open cycle.
  (`src/lib/ledger-state.ts`)
- Debt form: Starting balance moved before Remaining balance; remaining and
  minimum payment mirror starting balance until edited; interest rate is
  optional and stores null when blank. (`src/routes/app.debts.tsx`)
- Debt form: Type and Institution dropdowns show emoji/logo icons (reusing
  `institutionTypeVisual` / `InstitutionLogo`) with h-14 tap targets.
  (`src/routes/app.debts.tsx`)
- Diagnosed ADR-061 theme switching doing nothing: `<html data-theme>` never
  changed, so CSS was never involved. Live check showed the member row selects
  fine but `update household_members set theme=...` affects zero rows with no
  error — no self-UPDATE RLS policy. `useSetTheme()` now `.select("id")`s and
  throws on a zero-row write so the false success toast can't recur.
  (`src/lib/theme.tsx`, policy SQL in `docs/SCHEMA.md`)

Known issue: theme still won't persist until the `household_members` UPDATE
policy in docs/SCHEMA.md is run in Supabase.
- Restored the ADR-061 theme token reference: recreated src/components/ThemeTokenPreview.tsx and docs/THEME_TOKENS.md (both had been lost) and re-added the collapsible "Theme token reference" section to Settings. Read-only swatches with computed values per active theme.
- Implemented ADR-061 (Color Theme System) end to end: added
  `household_members.theme` (SQL written, per-user default 'standard', 7-value
  check constraint), new `src/lib/theme.tsx` (`ThemeProvider`/`useTheme`/
  `useSetTheme`, wired into the app root), six `[data-theme="..."]` override
  blocks in `src/styles.css` (halo, hellokitty, purple_dark, purple_pastel,
  cyber_neon, cyber_stealth), and a Theme section on Settings with a swatch
  button per theme that applies immediately with no reload. Docs updated:
  ADR-061 status, SCHEMA.md, CHANGELOG.md, TODO.md.
  - Known issue at the time: the `household_members.theme` SQL had not yet
    been run in Supabase, so selecting a theme would fail to save until then
    (a related `household_members` UPDATE RLS gap is noted elsewhere in
    today's session notes above).
- Investigated 5 VS Code problems flagged in `src/styles.css`: confirmed via
  PostCSS parse + `tsc --noEmit` + `vite build` that the file is structurally
  valid — the warnings are VS Code's built-in CSS language server not
  recognizing Tailwind v4 at-rules (`@import ... source(none)`, `@source`,
  `@custom-variant`, `@theme`), which predate this session. Recommended
  installing the Tailwind CSS IntelliSense extension. Separately found and
  fixed the `halo` theme block missing all 8 `--sidebar-*` overrides that the
  other five theme blocks define (added, reusing that block's own
  card/brand/secondary/border/ring tokens).
- Fixed a bug in ADR-046 (payment fees) — not an ADR change, since the fix
  makes the code match ADR-046 as originally decided: `useMarkSubmitted` and
  `useMarkCleared`'s direct-clear branch (`src/lib/payments.ts`) stamped every
  payment row with a `split_group_id` even when no fee was entered, so a
  fee-less payment saved as a 1-line "split" that then failed to re-save
  ("A split needs at least two lines"). Payments now only get a
  `split_group_id` when a real fee is paired; `useSaveSplitTransaction`
  (`src/lib/data-hooks.ts`) and the split editor (`src/routes/app.transactions.tsx`)
  now save a group edited down to one line as a plain transaction instead of
  blocking the save, which also self-heals any already-broken 1-line groups
  the next time they're opened and saved. No schema change.
- Added a Pending screen (`src/routes/app.pending.tsx`) as a top-level bottom-nav
  destination: all pending transactions (linked and manual), sortable by date /
  amount / account / category, groupable by account or category with per-group
  subtotals, plus a pending-total header card. Tapping a row confirms then clears
  it — bill/debt-linked rows reuse `useMarkCleared`/`toPayable` (ADR-035/036/046)
  so cycle credit and due-date rollover match Bills/Debts/Everything; unlinked
  rows take a plain status update. No new clearing mechanism, no new ADR.
  Bottom nav stays at 6 tabs: Accounts was demoted to the More grid to free the
  slot (`src/components/BottomNav.tsx`, `src/routes/app.more.tsx`).
  Files: src/routes/app.pending.tsx, src/components/BottomNav.tsx,
  src/routes/app.more.tsx, docs/ARCHITECTURE.md.
  Next: verify clearing a linked pending payment from this screen rolls the due
  date in the live app.
- Implemented ADR-065 (bill/debt payment and fee transactions default
  `institution_id`, extends ADR-046/ADR-053): `useMarkSubmitted`, the
  direct-clear branch of `useMarkCleared`, and `insertFeeTransaction` (all
  `src/lib/payments.ts`) now stamp the payment/fee transaction with the linked
  bill's or debt's own `institution_id` at write time — no extra user step, and
  the place can still be changed afterward via TransactionDetail edit. Manual
  Add Transaction (ADR-053) is unchanged. Docs updated: ADR-065 status,
  TODO.md.
  - Known issue: a one-time backfill SQL script was written (not applied) to
    set `institution_id` on existing bill/debt payment and paired fee rows
    where it is null — pending manual run in Supabase (see docs/TODO.md).
    Until then, older payments still show up in Fix Places even though new
    payments now default their place correctly.
