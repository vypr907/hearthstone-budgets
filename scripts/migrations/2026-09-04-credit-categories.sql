-- 2026-09-04 — Categories for credit-account activity (Mission Lane etc.).
-- ADR-069 (domain is the source of truth). Data-only, "Our Household". No schema change.
-- A cash-back credit is income; an interest charge is spending.

begin;

insert into public.categories (household_id, name, domain, parent_category, icon, color)
select v.household_id, v.name, v.domain, v.parent_category, v.icon, v.color
from (values
  ('cd8bce8c-81af-4302-8019-113e352ed443'::uuid, 'Cash Back / Rewards', 'income',   null::text,  '🎁', '#22c55e'),
  ('cd8bce8c-81af-4302-8019-113e352ed443'::uuid, 'Interest Earned',     'income',   null,        '📈', '#22c55e'),
  ('cd8bce8c-81af-4302-8019-113e352ed443'::uuid, 'Interest Charge',     'spending', 'Financial', '📉', '#ef4444')
) as v(household_id, name, domain, parent_category, icon, color)
where not exists (
  select 1 from public.categories c
  where c.household_id = v.household_id and c.name = v.name and c.domain = v.domain
);

commit;
