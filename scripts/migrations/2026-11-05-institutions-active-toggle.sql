-- 2026-11-05 — Institution active/inactive toggle (ADR-115). Visibility-only:
-- no balance/total calculation reads this column. Run in the Supabase SQL
-- Editor.

begin;

alter table public.institutions
  add column is_active boolean not null default true;

commit;
