-- 2026-09-16 — Institution links, per-member accounts, institution
-- parent/child (ADR-106). SCHEMA CHANGE: 2 new tables + 3 new columns.
-- Run in the Supabase SQL Editor. No data migration — all new/additive;
-- every existing institution/bill/debt is untouched.
--
-- (bills.is_active already exists — no migration needed there, only the
-- UI wiring described in ADR-106, part 4.)
--
-- RLS shape verified live via the read-only MCP against the most recent
-- precedent, scripts/migrations/2026-09-15-add-tags.sql (transaction_tags):
-- a pure/near-pure child table with no own household_id gets an EXISTS-join
-- policy through its parent, not a denormalized household_id column.
-- institution_links/institution_member_accounts only ever mean anything in
-- the context of their institution (same as account_balances), so both
-- follow that shape.

begin;

-- 1. institution_links — additional named links per institution (Bill Pay,
--    Patient Portal, custom "Other"). institutions.login_url stays the
--    "Main site" link, unchanged. "kind" is a real enum (not free text)
--    because both the Log In button default and the medical-only Patient
--    Portal gating need to find "the" link of a given kind reliably.
create table public.institution_links (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  kind text not null check (kind in ('bill_pay', 'patient_portal', 'other')),
  label text,
  url text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.institution_links enable row level security;
alter table public.institution_links force row level security;
create policy "household access via institution" on public.institution_links
  for all
  using (
    exists (
      select 1 from public.institutions i
      where i.id = institution_links.institution_id and is_household_member(i.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.institutions i
      where i.id = institution_links.institution_id and is_household_member(i.household_id)
    )
  );

grant select, insert, update, delete on public.institution_links to authenticated;
grant all on public.institution_links to service_role;

-- 2. institution_member_accounts — a household member's own account
--    (account/patient #, login username) at an institution, for providers
--    that bill each spouse separately rather than combining into one
--    joint invoice.
create table public.institution_member_accounts (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  member_id uuid not null references public.household_members(id) on delete cascade,
  account_number text,
  login_username text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (institution_id, member_id)
);

alter table public.institution_member_accounts enable row level security;
alter table public.institution_member_accounts force row level security;
create policy "household access via institution" on public.institution_member_accounts
  for all
  using (
    exists (
      select 1 from public.institutions i
      where i.id = institution_member_accounts.institution_id and is_household_member(i.household_id)
    )
  )
  with check (
    exists (
      select 1 from public.institutions i
      where i.id = institution_member_accounts.institution_id and is_household_member(i.household_id)
    )
  );

grant select, insert, update, delete on public.institution_member_accounts to authenticated;
grant all on public.institution_member_accounts to service_role;

-- 3. institutions.parent_institution_id — Amazon/Prime/Kindle/Audible-style
--    grouping. Kept to 2 levels (parent + children, no grandchildren) by
--    convention (the institution form only offers institutions with no
--    parent of their own as parent choices) -- not a DB constraint.
alter table public.institutions
  add column if not exists parent_institution_id uuid references public.institutions(id) on delete set null;

-- 4. bills/debts.institution_member_account_id — optional overlay,
--    coexists with the existing (unchanged, still required) institution_id
--    -- same "null = joint/not specified, set = this member's own" shape
--    accounts.owner_member_id already uses (ADR-088).
alter table public.bills
  add column if not exists institution_member_account_id uuid references public.institution_member_accounts(id) on delete set null;
alter table public.debts
  add column if not exists institution_member_account_id uuid references public.institution_member_accounts(id) on delete set null;

notify pgrst, 'reload schema';

commit;
