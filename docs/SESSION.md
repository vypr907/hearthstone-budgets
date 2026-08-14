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
- ADR-061 reference: added docs/THEME_TOKENS.md (token → consumer map, from grep
  across src/) and a dev-only `ThemeTokenPreview` swatch list in Settings under the
  theme picker. No theme values or logic touched; read-only, editing out of scope.
