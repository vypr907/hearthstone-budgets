-- 2026-09-15 — Add tags (ADR-104). SCHEMA CHANGE: two new tables.
-- Run in the Supabase SQL Editor. No data migration — brand new feature.
--
-- Same shape as ADR-005's institution_categories (verified live via the
-- read-only MCP before writing this: institution_categories has no own `id`,
-- composite PK (institution_id, category_id), both FKs `on delete cascade`,
-- RLS policy "Users can manage their household institution categories" is
-- `EXISTS (select 1 from institutions i where i.id = institution_categories
-- .institution_id and is_household_member(i.household_id))` for both `using`
-- and `with check`). `tags` mirrors `categories` (household_id FK, name,
-- icon, color — ADR-029 convention); `transaction_tags` mirrors
-- institution_categories exactly, just against transactions/tags instead of
-- institutions/categories.

begin;

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  name text not null,
  icon text,
  color text,
  created_at timestamptz not null default now()
);

create table public.transaction_tags (
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (transaction_id, tag_id)
);

alter table public.tags enable row level security;
alter table public.tags force row level security;
create policy "household access" on public.tags
  for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

alter table public.transaction_tags enable row level security;
alter table public.transaction_tags force row level security;
create policy "household access via tag" on public.transaction_tags
  for all
  using (
    exists (
      select 1 from public.tags t
      where t.id = transaction_tags.tag_id and is_household_member(t.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.tags t
      where t.id = transaction_tags.tag_id and is_household_member(t.household_id)
    )
  );

notify pgrst, 'reload schema';

commit;
