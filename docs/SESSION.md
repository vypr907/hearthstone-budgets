## Session Notes

### 2026-08-14
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
