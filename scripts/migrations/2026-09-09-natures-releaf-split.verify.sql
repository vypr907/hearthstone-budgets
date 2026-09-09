-- Verify 2026-09-09-natures-releaf-split.sql landed correctly.
-- Run after the migration commits.

-- 1. All 6 removed ids should be gone (expect 0 rows).
select id from public.transactions where id in (
  'f5f10c39-ad44-4587-ad4c-128195329ed9', '7182e3da-b391-4a26-be9a-e70821e4c2bd',
  '34e34d45-2b99-424c-9141-3925efd68bc1', '396b4bc9-fc4f-4366-a16f-1f206db5155d',
  'bcae3cea-dfe9-4fda-8683-2af14b869684', '6c0121a8-923e-4518-88c8-ee4b98af659d'
);

-- 2. Exactly 4 Nature's Releaf split groups should exist, one per date, each
--    summing to the right Venmo statement total (expect 4 rows: 65.50,
--    65.50, 45.50, 65.50 for 8/18, 8/21, 8/22, 8/30).
select transaction_date, sum(amount) as total, count(*) as line_count
from public.transactions
where split_group_id in (
  '02639b90-06c8-4b83-b3df-ecc2d1af40f2', 'aeb68afa-8ae9-49b6-a269-51f138087c56',
  'a66b7976-eb0d-4e7c-b417-a8906e1acc50', 'c52b9e29-505f-4897-89c7-f6ea6deb74a0'
)
group by transaction_date
order by transaction_date;

-- 3. No stray Nature's Releaf rows outside the 4 split groups remain on the
--    Venmo account for August (expect exactly the 12 new rows, 0 others).
select id, transaction_date, amount, description, split_group_id
from public.transactions
where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3'
  and institution_id = 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4'
  and transaction_date between '2026-08-01' and '2026-08-31'
order by transaction_date;

-- 4. Recompute the Venmo account's "current" balance the same way the app
--    does (anchor snapshot + cleared txns after it) — net change from this
--    migration should be exactly -$63.00 (removes the 8/30 double-count;
--    8/18/8/21/8/22 are restructured only, same totals as before).
select
  (select balance from public.account_balances
     where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3'
     order by as_of_date desc limit 1) as anchor,
  (select sum(amount) from public.transactions
     where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3'
       and status = 'cleared'
       and transaction_date > (select as_of_date from public.account_balances
                                  where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3'
                                  order by as_of_date desc limit 1)) as cleared_after_anchor;
