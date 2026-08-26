-- Pre-flight checks for automated test-DB access (ADR-083).
-- Run these via the read-only Supabase MCP before any test session that writes.
-- Every row of every result must match the "expect" note, or DO NOT run tests.

-- 1. The test user is a member of EXACTLY ONE household, and it is the TEST one.
--    expect: exactly 1 row, household = 'TEST Household — Lovable QA'
select h.name as household, u.email
from household_members m
join households h on h.id = m.household_id
join auth.users u on u.id = m.user_id
where u.email = 'steven.laszloffy+lovabletest@gmail.com';

-- 2. No public data table has RLS disabled.
--    expect: 0 rows
select c.relname as table_without_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = false;

-- 3. Every public data table has at least one policy.
--    expect: 0 rows
select c.relname as table_without_policy
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity = true
  and (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) = 0;

-- 4. No write policy is broader than household membership.
--    expect: 0 rows  (with_check is null only on SELECT-only policies)
select tablename, policyname, cmd, with_check
from pg_policies
where schemaname = 'public'
  and cmd in ('ALL', 'INSERT', 'UPDATE')
  and (with_check is null or with_check ilike '%true%' and with_check not ilike '%is_household_member%');

-- 5. auth roles used by the anon-key client cannot bypass RLS.
--    expect: authenticated=false, anon=false
select rolname, rolbypassrls from pg_roles where rolname in ('authenticated', 'anon');
