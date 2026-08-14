# ADR-061 theme switching — diagnosis and fix

## Findings (in the order you asked)

**Step 1 — does `<html data-theme>` update?** No. Live on the preview, `document.documentElement` reads `data-theme="standard"` and computed `--brand` is the standard green. So the failure happens before CSS is ever involved. Steps 2 and 3 are therefore not the cause — the CSS override blocks (`[data-theme="halo"]` etc.) sit after `:root` in `src/styles.css` and are correctly written, and components do read the semantic tokens.

**Actual root cause — the write silently saves nothing.** Running the exact statements the app runs, as the signed-in user:

- `select ... from household_members where user_id = <me>` → returns the member row, `theme = "standard"`.
- `update household_members set theme = 'halo' where user_id = <me>` → **no error, zero rows affected**.
- re-select → still `"standard"`.

So the household_members table has no RLS policy permitting the member to UPDATE their own row (or its check fails). PostgREST returns success with an empty result set for an update that matches no visible row, so `useSetTheme` sees `error === null`, fires the success toast, invalidates the query, refetches `"standard"`, and nothing changes. There is nothing wrong with `ThemeProvider`, the effect, or the CSS.

## The fix (two small parts, no redesign)

**1. Database — add the missing self-update policy.** A migration for the existing `household_members` table (no schema/column changes):

```sql
create policy "Members can update their own member row"
on public.household_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());
```

Confirm `grant update on public.household_members to authenticated;` is present as well; add it if not. This is the actual root cause fix. You run it in your Supabase project as with previous phases; the SQL is recorded in `docs/SCHEMA.md`.

**2. Client — stop reporting a silent no-op as success.** In `src/lib/theme.tsx`, `useSetTheme` gains `.select("id")` on the update and throws when zero rows come back, so a blocked write shows the error toast instead of a false confirmation. Optionally the same guard on `useSetExportFormat` is out of scope and left alone.

No changes to fonts, icons, the `household_members` schema, the theme token blocks, or any individual theme.

## Verification

After the policy is applied: pick Halo on `/app/settings`, confirm `<html data-theme="halo">` and that `--brand` / `--background` change immediately, then reload to confirm it persisted.

## Docs

`docs/SESSION.md` (diagnosis + fix), `docs/SCHEMA.md` (the policy SQL), `docs/DECISIONS.md` (note appended to ADR-061 that member self-update RLS is required), `docs/TODO.md` (migration-run checkbox).
