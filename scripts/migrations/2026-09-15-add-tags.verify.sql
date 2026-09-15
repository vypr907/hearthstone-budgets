-- Verify 2026-09-15-add-tags.sql landed correctly.

-- 1. Both tables exist with the expected columns.
select table_name, column_name, data_type
from information_schema.columns
where table_name in ('tags', 'transaction_tags')
order by table_name, ordinal_position;

-- 2. Both have RLS enabled + forced (expect true, true for each).
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname in ('tags', 'transaction_tags');

-- 3. Policies exist (expect one row each).
select tablename, policyname, cmd from pg_policies
where tablename in ('tags', 'transaction_tags');

-- 4. Constraints (expect: tags pkey on id + household_id fkey;
--    transaction_tags composite pkey (transaction_id, tag_id) + 2 fkeys,
--    both on delete cascade).
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid)
from pg_constraint
where conrelid in ('public.tags'::regclass, 'public.transaction_tags'::regclass);
