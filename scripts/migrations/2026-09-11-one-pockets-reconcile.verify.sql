-- Verify 2026-09-11-one-pockets-reconcile.sql.
-- Expect every net below to match the OnePay statement figure noted in the
-- comment, to the penny.

-- 1. Per-pocket Jul/Aug nets (coalesce(cleared_date,transaction_date)).
select 'Emergency' as pocket,
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31') as jul_net, -- expect 50.05
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31') as aug_net  -- expect -49.72
from public.transactions where account_id = 'da39073a-05fc-49aa-bca3-ba9b60c84b20' and status = 'cleared'
union all
select 'Food',
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31'), -- expect 0.00
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31')  -- expect 0.00
from public.transactions where account_id = 'bd68b0eb-62c4-4e46-bd01-36a7efc2d558' and status = 'cleared'
union all
select 'Games',
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31'), -- expect 0.00
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31')  -- expect 0.00
from public.transactions where account_id = '1ee2c43e-eb43-44b0-92b6-3148ad193474' and status = 'cleared'
union all
select 'kitten''s playroom',
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31'), -- expect -5.00
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31')  -- expect 0.00
from public.transactions where account_id = '499eef21-f29e-491b-96c1-0f7e3b4bf4f0' and status = 'cleared'
union all
select 'Pay Autosave',
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31'), -- expect -62.57
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31')  -- expect -2.28
from public.transactions where account_id = 'daeee338-c970-4c7c-8124-9ae55ee884dc' and status = 'cleared'
union all
select 'Steven''s Savings',
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31'), -- expect 620.47
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31')  -- expect -435.67
from public.transactions where account_id = '6698cc8a-db5d-4937-9213-7b77fd3e4556' and status = 'cleared';

-- 2. Dup rows gone (expect 0 rows).
select id from public.transactions where id in (
  '3b2537fa-db61-4eef-8ea1-54f409ec1c8d','097217a4-ef6c-439b-91d6-d265b83ee823',
  '8ee9eb57-46c5-4908-a2b0-8aeb196d4636','13481539-f188-41d3-927a-441b69ea94aa'
);

-- 3. Each pocket's current balance == its existing 8/31 anchor + nothing
--    cleared after it (all our changes land before/on 8/31). Expect
--    cleared_after_anchor = 0 for all 6 rows.
select a.name,
  (select balance from public.account_balances b where b.account_id = a.id order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(t.amount),0) from public.transactions t where t.account_id = a.id and t.status = 'cleared'
     and coalesce(t.cleared_date, t.transaction_date) > (select as_of_date from public.account_balances b where b.account_id = a.id order by as_of_date desc limit 1)) as cleared_after_anchor
from public.accounts a
where a.id in ('da39073a-05fc-49aa-bca3-ba9b60c84b20','bd68b0eb-62c4-4e46-bd01-36a7efc2d558',
  '1ee2c43e-eb43-44b0-92b6-3148ad193474','499eef21-f29e-491b-96c1-0f7e3b4bf4f0',
  'daeee338-c970-4c7c-8124-9ae55ee884dc','6698cc8a-db5d-4937-9213-7b77fd3e4556');

-- 4. Checking Aug 29 now shows exactly two +50.00 Internal Transfer legs (not four).
select count(*) from public.transactions
where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and amount = 50.00
  and coalesce(cleared_date,transaction_date) = '2026-08-29';  -- expect 2
