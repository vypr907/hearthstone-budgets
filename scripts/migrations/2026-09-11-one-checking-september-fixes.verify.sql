-- Verify 2026-09-11-one-checking-september-fixes.sql.

-- 1. Both new rows present.
select id, amount, description from public.transactions where id in (
  'a6b9e2d4-9f1b-4c3a-8e7f-2d5c8a1b3f60','c1e4f7a2-6d3b-4a91-9c8e-5b7d0f2a4e13'
);

-- 2. $36.00 transfer now dated 9/4.
select id, transaction_date, cleared_date from public.transactions where id = 'ca8e53ee-e257-4949-b407-8d5afde759dc';

-- 3. OnePay Advance repayment cluster (9/9) now totals -231.75.
select sum(amount) from public.transactions
where linked_debt_id = 'a1581069-a274-4ef5-91a5-690943fed672'
  and coalesce(cleared_date,transaction_date) = '2026-09-09'
union all
select sum(amount) from public.transactions
where id in ('e63a2cfa-9bd3-4d09-a8f1-001ad728f33c','c1e4f7a2-6d3b-4a91-9c8e-5b7d0f2a4e13');

-- 4. Sept 1-11 net through today (expect ~57.45 - 22.75 = 34.70 -- this is
--    now purely historical detail; the 9/11 anchor below is what actually
--    governs the current balance).
select coalesce(sum(amount),0) as sept_1_11_net from public.transactions
where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared'
  and coalesce(cleared_date, transaction_date) between '2026-09-01' and '2026-09-11';

-- 5. Current balance now reads the real $13.14 (9/11 anchor, nothing cleared
--    after it yet).
select
  (select balance from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1) as anchor,
  (select as_of_date from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1) as anchor_date,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1)) as cleared_after_anchor;
