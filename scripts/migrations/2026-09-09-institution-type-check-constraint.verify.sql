-- Verify 2026-09-09-institution-type-check-constraint.sql landed correctly.

-- 1. The constraint should now list all 22 values.
select pg_get_constraintdef(oid) as def
from pg_constraint
where conrelid = 'public.institutions'::regclass
  and conname = 'institutions_institution_type_check';

-- 2. Sanity check: this should succeed (no error) — proves the new values
--    are now accepted. Rolled back immediately, no real change made.
begin;
update public.institutions set institution_type = 'restaurant'
  where id = '4063bb26-f187-4b46-a7e4-5763676ffcbf'; -- ASRC Snack Bar
rollback;
