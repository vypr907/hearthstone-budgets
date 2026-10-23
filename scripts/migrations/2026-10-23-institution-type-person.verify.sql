-- Verify 2026-10-23-institution-type-person.sql landed correctly.

-- 1. The constraint should now list all 23 values, including 'person'.
select pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.institutions'::regclass
  and conname = 'institutions_institution_type_check';

-- 2. Sanity check: inserting a 'person' institution_type should succeed
--    (no error). Rolled back immediately, no real change made.
begin;
insert into public.institutions (household_id, name, institution_type)
select id, 'ADR-113 verify (person)', 'person'
from public.households
limit 1;
rollback;
