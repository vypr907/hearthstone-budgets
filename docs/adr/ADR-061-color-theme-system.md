## ADR-061: Color Theme System

Decision:
Add seven selectable UI color themes: `standard` (current colors, default),
`halo`, `hellokitty`, `purple_dark`, `purple_pastel`, `cyber_neon`, `cyber_stealth`.
Theme is a per-user preference, not household-shared data — added as:

```sql
alter table household_members
  add column theme text not null default 'standard'
  check (theme in ('standard', 'halo', 'hellokitty', 'purple_dark',
                    'purple_pastel', 'cyber_neon', 'cyber_stealth'));
```

Mechanism: a `data-theme="<value>"` attribute on `<html>`, set by a new
`ThemeProvider` (`src/lib/theme.tsx`) that reads the current member's `theme` on
load and exposes `useTheme()`/`useSetTheme()`. Each non-standard theme is a CSS
block in `src/styles.css` overriding the existing token set already established
in the Phase 6.6 visual restyle (`--brand`, `--gradient-brand`, `--shadow-card`,
`--item-1..6`, `--background`, and any other `:root` variables in current use) —
no new variable names, no component changes required. `useSetTheme()` writes to
`household_members.theme` via a mutation hook (same shape as `useSetExportFormat`,
ADR-028). Settings screen (`/app/settings`) gets a "Theme" section with a
swatch/preview button per theme, applying immediately on selection with no reload.

v1 is colors only — fonts and icon packs are explicitly deferred to a future ADR.

Amendment (2026-08-14): the column migration alone leaves the picker inert.
`household_members` also needs an UPDATE policy for the member's own row
(`user_id = auth.uid()`) plus `grant update ... to authenticated` — see
`docs/SCHEMA.md`. Without it PostgREST returns success with zero rows updated,
so the save toast fires while nothing persists. `useSetTheme()` now selects the
affected rows and throws when none come back.

Reason:
Household members wanted personalization beyond light/dark, including playful
themes (Halo, Hello Kitty) and two variants each of Purple and Cyber. Since the
app's visual system already runs entirely on CSS custom properties (Phase 6.6),
theming is additive — no component touches color literals directly, so a new
theme is a CSS block plus one column, not a rearchitecture. Per-user rather than
per-household storage was chosen because this is a personal display preference,
unlike `export_format` (ADR-028), which affects a shared, printable artifact both
users see identically.

Status: Decided 2026-08-14. Implemented 2026-08-14 (household_members.theme
column + check constraint written but not yet run in Supabase — see
docs/TODO.md; src/lib/theme.tsx ThemeProvider/useTheme/useSetTheme; six
[data-theme="..."] override blocks in src/styles.css; Settings screen Theme
section with a swatch button per theme).

