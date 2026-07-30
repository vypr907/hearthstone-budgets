# Parent Category Migration Reference

**Status:** Not yet implemented. See ADR-011 in `DECISIONS.md` for why this was deferred.

**Purpose:** Step-by-step path from `categories.parent_category` (plain text) to a
proper `parent_categories` table with an FK, whenever you're ready to make that move.
Read this whole doc before starting — steps are ordered and some are not easily reversible.

---

## Why you're doing this (recap)

- Eliminates naming-drift bugs (e.g. "Gifts/Holidays" vs "Gifts & Holidays") structurally,
  instead of catching them via a pre-insert validation query each import.
- Renaming a parent group becomes one row update instead of a text sweep across every
  `categories` row that uses it.
- Opens the door to parent-level metadata (color, icon, chart display order) without
  bolting more columns onto `categories`.

---

## Pre-migration checklist

- [ ] Confirm no active Lovable prompt is mid-flight (don't run this alongside a Lovable session — see the Kiro/GitHub sync risk in `PLAN.md` for why mixed simultaneous edits are risky)
- [ ] `git pull` / confirm your local repo is current if any local tooling touches this
- [ ] Back up current state: `select * from categories` exported somewhere, just in case
- [ ] Run the dedup check below *before* creating anything, so you know how many real distinct parent values exist

```sql
select distinct parent_category, domain
from categories
order by domain, parent_category;
```

Eyeball this list for near-duplicates (casing, `&` vs `/`, trailing spaces) and fix them
in `categories.parent_category` directly first — same one-line `update` pattern used to
resolve "Gifts/Holidays" vs "Gifts & Holidays". Cleaner to fix drift before the migration
than to carry it into the new table.

---

## Step 1 — Create the new table

```sql
create table parent_categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  domain text not null, -- mirrors categories.domain ('spending' | 'bill' | 'debt' | 'institution')
  color text,           -- optional, for future chart use
  icon text,            -- optional, for future chart use
  display_order int,    -- optional, for future chart use
  created_at timestamptz not null default now(),
  unique (household_id, name, domain)
);

alter table parent_categories enable row level security;
create policy "household access" on parent_categories for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
```

## Step 2 — Backfill from existing distinct values

```sql
insert into parent_categories (household_id, name, domain)
select distinct household_id, parent_category, domain
from categories
where parent_category is not null;
```

## Step 3 — Add the FK column to `categories` (nullable at first)

```sql
alter table categories add column parent_category_id uuid references parent_categories(id);

update categories c
set parent_category_id = pc.id
from parent_categories pc
where pc.household_id = c.household_id
  and pc.domain = c.domain
  and pc.name = c.parent_category;
```

## Step 4 — Verify before dropping anything

```sql
-- Should return zero rows: any category with a parent_category text value
-- but no matching parent_category_id means step 3's join missed something.
select * from categories
where parent_category is not null and parent_category_id is null;
```

Do not proceed to Step 5 until this returns zero rows.

## Step 5 — Drop the old text column

```sql
alter table categories drop column parent_category;
alter table categories alter column parent_category_id set not null;
```

(Only set `not null` if every spending/bill/debt category realistically has a parent
group in your data — check first if that's actually true for all domains, not just spending.)

---

## Step 6 — Update everything downstream that reads `parent_category`

This is the part that's easy to miss — the text column is referenced in more places
than just the schema:

- [ ] **Lovable prompts already run:** the Phase 4 Spending screen prompt and the
      group-header fix prompt (2026-07-30) both told Lovable to group/label using
      `categories.parent_category` directly. Re-prompt Lovable with the new shape:
      ```
      categories.parent_category has been replaced with categories.parent_category_id,
      a foreign key to a new parent_categories table (parent_categories.name is the
      display label). Update the Spending screen's grouping/header logic to join through
      parent_category_id -> parent_categories.name instead of reading a text column.
      ```
- [ ] **Phase 1 category seed SQL in `PLAN.md`** — that seed script inserts `parent_category`
      as a literal string per row. Rewrite it to insert into `parent_categories` first,
      then reference the resulting ids when seeding `categories`.
- [ ] **`SCHEMA.md`** — update the `categories` table definition and the ER diagram
      (`Household -> Categories`) to show the new `parent_categories` table.
- [ ] **`CONTEXT.md`** — note the schema change under "Important Rules" or status.
- [ ] **`CHANGELOG.md`** — log the migration once done.
- [ ] Any chart/report prompts (Phase 6 net worth / spending-by-category charts) that
      may reference `parent_category` by name — re-check those prompts' wording too.

---

## Rollback plan (if something breaks mid-migration)

Steps 1–4 are non-destructive — `parent_category` (text) still exists alongside the new
FK column, so you can pause indefinitely between Step 4 and Step 5 with zero risk.

**Step 5 is the point of no easy return** (the text column is dropped). Don't run Step 5
until:
- Step 4's verification query returns zero rows, AND
- You've re-prompted Lovable (Step 6) and confirmed the Spending screen still renders
  correct group headers against the new join.

If you need to roll back after Step 5, you'd need to reverse it manually:
```sql
alter table categories add column parent_category text;
update categories c
set parent_category = pc.name
from parent_categories pc
where pc.id = c.parent_category_id;
```
