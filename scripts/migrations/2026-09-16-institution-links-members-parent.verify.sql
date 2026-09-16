-- Verify 2026-09-16-institution-links-members-parent.sql landed correctly.

-- 1. Both new tables exist, empty, with RLS enabled + forced.
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relname in ('institution_links', 'institution_member_accounts');

select count(*) as institution_links_rows from public.institution_links;
select count(*) as institution_member_accounts_rows from public.institution_member_accounts;

-- 2. Policies exist on both.
select tablename, policyname, cmd
from pg_policies
where tablename in ('institution_links', 'institution_member_accounts');

-- 3. New columns exist with the right type/nullability.
select table_name, column_name, data_type, is_nullable
from information_schema.columns
where (table_name = 'institutions' and column_name = 'parent_institution_id')
   or (table_name = 'bills' and column_name = 'institution_member_account_id')
   or (table_name = 'debts' and column_name = 'institution_member_account_id');

-- 4. Nothing existing was touched — row counts unchanged (compare to
--    whatever you already know these should be; this just confirms the
--    migration didn't accidentally delete/modify anything).
select
  (select count(*) from public.institutions) as institutions_count,
  (select count(*) from public.bills) as bills_count,
  (select count(*) from public.debts) as debts_count;

-- 5. Every existing bill/debt's new column defaults to null (no accidental
--    backfill).
select count(*) as bills_with_member_account from public.bills
where institution_member_account_id is not null;
select count(*) as debts_with_member_account from public.debts
where institution_member_account_id is not null;
select count(*) as institutions_with_parent from public.institutions
where parent_institution_id is not null;
