-- Verification for 2026-09-04-credit-categories.sql. Read-only.

-- expect: 3 rows — Cash Back / Rewards (income), Interest Earned (income),
--         Interest Charge (spending, parent Financial)
select name, domain, parent_category, icon
from public.categories
where household_id = 'cd8bce8c-81af-4302-8019-113e352ed443'
  and name in ('Cash Back / Rewards', 'Interest Earned', 'Interest Charge')
order by domain, name;
