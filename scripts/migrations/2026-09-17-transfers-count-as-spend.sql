-- 2026-09-17 — accounts.transfers_count_as_spend (ADR-107). SCHEMA CHANGE:
-- 1 new nullable boolean column, default false, plus a data-only flip on 2
-- known accounts for "Our Household". Run in the Supabase SQL Editor.
--
-- No RLS change needed — accounts already has household-scoped RLS; this is
-- just a new column on an existing table.

begin;

alter table public.accounts
  add column if not exists transfers_count_as_spend boolean not null default false;

-- Steph One Checking and Cash — Stephanie: not fully tracked day-to-day by
-- this household yet (ADR-107) — a transfer landing on either now counts as
-- real spend instead of an internal, non-spend transfer.
update public.accounts
  set transfers_count_as_spend = true
  where id in (
    'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', -- Steph One Checking
    '8fa057e0-a235-4a7d-ac47-5d7f62810ba2'  -- Cash — Stephanie
  );

notify pgrst, 'reload schema';

commit;
