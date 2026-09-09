-- Verify 2026-09-09-institution-type-reclass.sql landed correctly.
-- Run after the migration commits.

-- 1. Counts per new type (expect: restaurant 25, grocery_store 3,
--    gas_station 3, liquor_store 3, department_store 4, specialty_store 5,
--    venue 1, game 5, app 2, dispensary 1, personal_care 1, employer 1,
--    delivery 2).
select institution_type, count(*)
from public.institutions
where household_id = 'cd8bce8c-81af-4302-8019-113e352ed443'
  and institution_type in (
    'restaurant','grocery_store','gas_station','liquor_store','department_store',
    'specialty_store','venue','game','app','dispensary','personal_care','employer','delivery'
  )
group by institution_type
order by institution_type;

-- 2. Remaining `other` rows should be exactly the 6 deliberately-ambiguous
--    ones (Dept of Education, DFAS, Gavora's, Lacey Miller, MoneyLion, The
--    Sheet Code) plus ASRC Federal's siblings/any not covered above.
select name from public.institutions
where household_id = 'cd8bce8c-81af-4302-8019-113e352ed443'
  and institution_type = 'other'
order by name;

-- 3. UberEats should now be 'delivery', not 'subscription'.
select name, institution_type from public.institutions
where id = 'd8f0d0f6-7e50-47c6-82de-8051effedd11';
