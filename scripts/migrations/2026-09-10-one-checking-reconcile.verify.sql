-- Verify 2026-09-10-one-checking-reconcile.sql landed correctly.

-- 1. New plain rows present (expect 37).
select count(*) as plain_rows from public.transactions where id in (
  '7d94a79a-cd68-401a-8374-ec2b746e229b', '23243373-e3a2-4cbb-8053-0f529ed81734', '84374865-f062-4f20-8e9e-e36ef3bf1a82', '8b9dacae-945d-4616-8142-e053cc873687', 'f4fbd203-d876-4056-823f-7ce19f6b47bc', '5d92c69d-b68f-494d-8a69-5b1e083c5c8b', '42abaea3-10f0-404f-84bb-aa2c7d7a705f', '238c8495-3362-428a-870d-1028fcb7737f', '27919100-3c1c-496c-8f3d-f47ab67c5936', '906421f0-5524-48dd-8092-153df6db4bed', '73db5125-de24-4fb4-83e8-9814c6e1b126', '07ac9ede-b611-4bd0-89f5-d4d94d443040', 'd3906142-e34c-49b1-8075-cf59bf27530a', '8db23b7e-52c3-4ea1-888d-fb07012bf0c8', '81fa1ae4-95ab-466c-806d-c7bf81a0b830', '72e4c921-9f7d-45b9-802c-3370c41e2d2c', '95bbcbe2-5e69-4464-895c-60c90024fc55', '35c0d059-84b5-4618-8de8-b5123f9c44e7', '4eb45663-e57b-4522-83f8-2cd9c0ae6357', '736cb33e-bf86-42c5-88d6-a26d66d9c0dd', '881c115e-2602-4026-8661-de57265be3c2', '3027ec62-8420-42e2-8ce7-6fbdacea45ec', '3de66c67-3b0a-4d50-84a7-c5d937ed6e2f', 'c0201c0f-840b-4979-82b6-b3956d61258b', '86fdb881-37a0-4f81-8016-fa11ae3e346a', 'e508eaa7-37fc-4a08-839c-8d966dc3f8ad', '9268f437-cb5a-4318-879d-09c6989e84a3', '0e91c1f3-1b47-46e7-8402-e67e86572378', 'ecd66b9f-cbc5-4bd2-8f62-5b4623e34ef9', '73b28453-7a5e-4a19-8ba0-a400f34f9362', '4da6a79b-86c5-4c3d-84cf-1781728ee577', 'eaca292a-132a-4d1d-8bac-3c44aa99855b', 'a1d61366-92d5-4ca7-8989-bcecb8662119', '124a0af7-1e18-47f9-897c-4a6d52b546fb', '5744cc8c-d7e1-415c-82c1-62a250c9de3b', 'c6d4326f-297f-45a7-8915-a3f077d94471', 'c609a240-fdde-4cb8-8a32-f13b42a8a654'
);

-- 2. The advance row (expect 1, amount 225.00).
select amount, description from public.transactions where id = '7ca3aca2-b8c0-4507-888c-217406a46857';

-- 3. Every transfer group sums to 0 with exactly 2 legs (expect 25 rows, total 0.00, legs 2).
select transfer_group_id, sum(amount) as total, count(*) as legs
from public.transactions where transfer_group_id in (
  '330f7993-5dd4-40c1-8961-0dc440aafc97',
  'b6949334-a799-4572-810c-7f9b7cf6e0b3',
  '3527b3af-02b3-4676-87dd-bbc7e811495d',
  '17fe19f4-9694-4d4e-80c1-bd59fd207239',
  '1de54009-bbb2-4448-8e15-1acb75b38f70',
  'f9cdfaa0-6a8e-49d0-8dbc-5b28800f0b20',
  '83211297-776b-4d1a-89fe-cfc00cfe0f94',
  '6a1b550b-f662-4345-85f0-dbb135ee5082',
  '294d1e3d-4aec-40fb-8a5e-8ed9114717df',
  'e6e4c782-648f-4be8-8bb0-445559b98164',
  'ff58e39b-1711-4b85-847c-4e2fdd9ed308',
  '3ca78481-9b50-4223-8c2e-13fb47264f9d',
  '4dd565cd-48c4-4a10-81d4-d8709fd85564',
  '7d24c56b-87a4-4434-81b8-6234e232c2bb',
  '9c712634-0ad0-40ae-8043-4ca8244f838c',
  'e03ca630-fc7f-447e-8992-6e828806d9c1',
  'b682c5cb-c3e9-4377-8468-501d495bb172',
  '28da0629-e76d-4143-8cd5-52b82ebbf557',
  '316fdbc2-ce25-487f-86fd-8524e209e708',
  '5d35d737-65ef-4ecf-8c3d-09c9b8184efc',
  '9f55c607-a679-440a-8759-03783c27ac0c',
  'f1afab2a-3da2-433f-89f4-d7f15ad7d284',
  '5714395d-9466-4e58-8520-2b085f5660d8',
  'cdd34ffa-eef0-440b-8ebd-7afca2e086c6',
  '3b7eb2d5-de94-47d2-855b-6c136c647946'
) group by transfer_group_id having sum(amount) <> 0 or count(*) <> 2;
-- (0 rows returned = all good)

-- 4. Corrections (expect: 84b331a9 cleared_date 2026-07-29; 2c010d5b
--    amount -11.16 & both dates 2026-08-01).
select id, transaction_date, cleared_date, amount from public.transactions
where id in ('84b331a9-1a23-4745-9d2c-acb1d1c9c654','2c010d5b-bc37-4012-a747-3d9c6a7b98fa');

-- 4b. Duplicate deleted (expect 0 rows).
select id from public.transactions where id = '6713eac2-b2fd-455b-b76b-be33108461dd';

-- 5. One Checking span nets (compared by cleared_date). Expect roughly:
--    Jul ~ -281  (reaches ~-690 once the ~$410 of bill/debt-linked items in
--                 the header checklist are marked paid in-app; the last
--                 ~$22 to -712.96 is the two 8/1-dated July charges — note 2);
--    Aug ~ -50   (statement -56.42; ~$6 residual absorbed by the 8/31
--                 anchor; deeper August items deferred — see header note 3).
select
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-07-01' and '2026-07-31') as jul_net,
  sum(amount) filter (where coalesce(cleared_date,transaction_date) between '2026-08-01' and '2026-08-31') as aug_net
from public.transactions where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared';

-- 6. Recompute each touched account's "current" balance the app way
--    (latest anchor + cleared txns after it, compared by cleared_date).
select 'One Checking' as account,
  (select balance from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1)) as cleared_after_anchor
union all
select 'Steven''s Savings' as account,
  (select balance from public.account_balances where account_id = '6698cc8a-db5d-4937-9213-7b77fd3e4556' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '6698cc8a-db5d-4937-9213-7b77fd3e4556' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '6698cc8a-db5d-4937-9213-7b77fd3e4556' order by as_of_date desc limit 1)) as cleared_after_anchor
union all
select 'Emergency' as account,
  (select balance from public.account_balances where account_id = 'da39073a-05fc-49aa-bca3-ba9b60c84b20' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = 'da39073a-05fc-49aa-bca3-ba9b60c84b20' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = 'da39073a-05fc-49aa-bca3-ba9b60c84b20' order by as_of_date desc limit 1)) as cleared_after_anchor
union all
select 'Food' as account,
  (select balance from public.account_balances where account_id = 'bd68b0eb-62c4-4e46-bd01-36a7efc2d558' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = 'bd68b0eb-62c4-4e46-bd01-36a7efc2d558' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = 'bd68b0eb-62c4-4e46-bd01-36a7efc2d558' order by as_of_date desc limit 1)) as cleared_after_anchor
union all
select 'Games' as account,
  (select balance from public.account_balances where account_id = '1ee2c43e-eb43-44b0-92b6-3148ad193474' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '1ee2c43e-eb43-44b0-92b6-3148ad193474' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '1ee2c43e-eb43-44b0-92b6-3148ad193474' order by as_of_date desc limit 1)) as cleared_after_anchor
union all
select 'kitten''s playroom' as account,
  (select balance from public.account_balances where account_id = '499eef21-f29e-491b-96c1-0f7e3b4bf4f0' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '499eef21-f29e-491b-96c1-0f7e3b4bf4f0' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '499eef21-f29e-491b-96c1-0f7e3b4bf4f0' order by as_of_date desc limit 1)) as cleared_after_anchor
union all
select 'Pay Autosave' as account,
  (select balance from public.account_balances where account_id = 'daeee338-c970-4c7c-8124-9ae55ee884dc' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = 'daeee338-c970-4c7c-8124-9ae55ee884dc' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = 'daeee338-c970-4c7c-8124-9ae55ee884dc' order by as_of_date desc limit 1)) as cleared_after_anchor;
