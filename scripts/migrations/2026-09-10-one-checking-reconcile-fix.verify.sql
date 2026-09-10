-- Verify 2026-09-10-one-checking-reconcile-fix.sql landed correctly.

-- 1. The 5 new rows present (expect 5; the two 137c4151 split legs sum to -76.42).
select id, amount, description, split_group_id, transaction_date
from public.transactions
where id in (
  'c3965437-1ce8-4e1d-925a-1247e49e5cbb', '448ac9a8-ba63-4a47-ab6f-9c3e20d5cf77',
  'f7c71e86-0021-4c0c-a5e1-eb5755e4fc88', '4167ed37-dc9f-44fb-8ed4-8cb5cd616f2d',
  '39521805-8e96-45b8-bb7c-993269b803b3')
order by transaction_date, amount;

-- 2. Grant split sums to -76.42 (expect one row, total -76.42, legs 2).
select split_group_id, sum(amount) as total, count(*) as legs
from public.transactions where split_group_id = '137c4151-4aad-4677-b36f-315778f08082'
group by split_group_id;

-- 3. The two -$5.26 duplicates are gone (expect 0 rows).
select id from public.transactions
where id in ('124a0af7-1e18-47f9-897c-4a6d52b546fb', 'b1f841f2-9525-4eab-b5e7-4dc8aee7d9f6');

-- 4. Aaron's Club + KFC now cleared 7/31 (expect both cleared_date 2026-07-31,
--    transaction_date still 2026-08-01).
select id, transaction_date, cleared_date, amount from public.transactions
where id in ('88fdee29-a042-4f45-a0c2-b64b74791fad', '7aa0c7ac-bb2c-4a80-9e43-d8c2030b569a');

-- 5. One Checking July / August spans (compared by cleared_date). Expect
--    July ~ -517  (reaches ~-706 once the 6 Issue #62 in-app marks are done —
--                  ~$7 short of -712.96 from small entry drift);
--    August ~ -24 (statement -56.42; residual absorbed by the 8/31 anchor).
select
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31') as jul_net,
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31') as aug_net
from public.transactions where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared';

-- 6. One Checking current balance the app way (latest anchor + cleared after).
select
  (select balance from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1)) as cleared_after_anchor;
