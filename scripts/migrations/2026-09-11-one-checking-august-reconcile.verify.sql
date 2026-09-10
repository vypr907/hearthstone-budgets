-- Verify 2026-09-11-one-checking-august-reconcile.sql.

-- 1. Duplicates gone (expect 0 rows).
select id from public.transactions where id in (
  '1af8fc5d-6e4b-40b6-8e7e-c3031ab03bc0','c632bfe2-8fd3-4b71-8cda-4afa491a43c3',
  '1324cd9d-eb9d-4d49-8a51-cb8f0d8756aa','72847ae1-c7b7-4e31-8a08-11c056b7b095',
  '386da7ec-2797-47cf-8713-e26d53dcb210','b3f41562-dfc9-4092-8b61-0fb65d35906a',
  'ad8c6cdb-b242-4987-bd7c-bfbf3348e872','e70e0953-dddf-455e-89b8-8d257a870121');

-- 2. New rows present (expect 14; net -93.01 = Snapchat -5.26 + 7 bagels
--    -87.75 + Obligo net 0 + BowCredit net 0).
select count(*) as new_rows, to_char(sum(amount),'FM990.00') as net from public.transactions where id in (
  'bd22c6bd-8080-4880-8781-820a8985cf02','a95552f7-58a7-41f3-a9a7-e318c3c02cb4',
  'b3abe3e4-9012-4182-a521-a056b89a9b3f','993265cc-9d15-4be3-bce3-092a612251aa',
  'e439d532-e097-4e4b-9949-dfd9c9288842','9ee9cbc0-9979-4e05-8357-1eeacafecb6f',
  'fa03383d-38fd-447a-97e0-09c5a1531e0e','214046e1-d906-49ae-9328-654444cc59ce',
  '9cf2f9e3-8803-4054-9501-4d71cfba6653','aabb2a50-defd-47b1-9a8f-4582fbf249cd',
  '51d18f17-f6e5-4d8c-b211-0a9d9784ce80','acf9648c-f1a7-44ba-83a1-3d720d1c8c83',
  'ca3ae498-db8a-490b-92db-43950659c739','9def87ed-e709-49c1-9035-cc1433a6374c');

-- 3. Fred Meyer -8.38 now cleared 8/1 (expect cleared_date 2026-08-01).
select id, transaction_date, cleared_date, amount from public.transactions
where id = 'a5bef86c-d976-438e-9a0c-adfae0a5b96c';

-- 4. One Checking July / August spans (compared by cleared_date). Expect
--    July  ~ -698  (the -8.38 Fred Meyer moves OUT to Aug where the statement
--                   posts it; statement -712.96, ~$15 residual in small entry
--                   drift + the items left as-is);
--    August ~ -57  (statement -56.42; ~$1 residual).
--    Both months' displayed + month-end balances stay exact via the anchors.
select
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31') as jul_net,
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31') as aug_net
from public.transactions where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared';

-- 5. One Checking current balance (latest anchor + cleared after). Unchanged (~119.15).
select
  (select balance from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1)) as cleared_after_anchor;

-- 6. Steven's Savings current (the 3 deleted round-up legs shed +$2.00 of
--    incoming; anchor 185.31 @ 8/31, so "current" only reflects Sept — unchanged).
select
  (select balance from public.account_balances where account_id = '6698cc8a-db5d-4937-9213-7b77fd3e4556' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '6698cc8a-db5d-4937-9213-7b77fd3e4556' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '6698cc8a-db5d-4937-9213-7b77fd3e4556' order by as_of_date desc limit 1)) as cleared_after_anchor;
