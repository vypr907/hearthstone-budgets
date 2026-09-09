-- Verify 2026-09-09-usaa-reconcile.sql landed correctly.

-- 1. Paycheck correction (expect 1809.38).
select amount from public.transactions where id = 'e3a25197-6b5f-46f7-a70d-24daa6eb92a8';

-- 2. All 9 new plain rows present (expect 9 rows).
select id, account_id, transaction_date, amount, description
from public.transactions
where id in (
  '30bec797-5ed0-4f0b-ad74-ba82208eca5c', 'cf5b602c-3b91-44d8-acec-c3382dd20f63',
  '4be073c6-a951-4fae-85ce-6215e3ee2742', '6f987c5b-bcf8-41fd-b3e6-589ec0b3e168',
  '46660716-4616-460a-8a0a-28feb477ab67', '24c87ccc-b06d-4018-9cb3-5005a6ba45ff',
  '71079108-0868-49e5-abfb-20682dd207f3', 'd59f0929-a315-4dfa-acf8-5c4fce793252',
  '04aa9211-3cd5-458b-a9d9-50fdb7c01726'
)
order by transaction_date;

-- 3. The 3 transfer pairs balance to zero and share the right group ids
--    (expect 3 rows, each total 0.00).
select transfer_group_id, sum(amount) as total, count(*) as legs
from public.transactions
where transfer_group_id in (
  '890da138-3fef-4ae4-a36c-8bd0f6677132',
  'c05dc819-4602-4801-9368-7c1f837a9dcf',
  '1a53120b-8c5e-4215-8682-5d5c424239a7'
)
group by transfer_group_id;

-- 4. Recompute both accounts' "current" balance the same way the app does
--    (anchor + cleared txns after the anchor's as_of_date, ADR-100: compared
--    by cleared_date).
select
  'Classic Checking' as account,
  (select balance from public.account_balances where account_id = '2e937b2d-471a-46f3-9a9d-cfc342a66414' order by as_of_date desc limit 1) as anchor,
  (select sum(amount) from public.transactions where account_id = '2e937b2d-471a-46f3-9a9d-cfc342a66414' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '2e937b2d-471a-46f3-9a9d-cfc342a66414' order by as_of_date desc limit 1)) as cleared_after_anchor
union all
select
  'USAA Savings',
  (select balance from public.account_balances where account_id = '7793c44f-4d9a-456a-9bc4-2edeafbfa68a' order by as_of_date desc limit 1),
  (select sum(amount) from public.transactions where account_id = '7793c44f-4d9a-456a-9bc4-2edeafbfa68a' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '7793c44f-4d9a-456a-9bc4-2edeafbfa68a' order by as_of_date desc limit 1));
