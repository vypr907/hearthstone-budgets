-- Verify 2026-09-08-venmo-reconcile-dedupe.sql landed correctly.
-- Run after the delete commits.

-- 1. All 13 ids should now be gone (expect 0 rows).
select id from public.transactions where id in (
  'f99760ab-6f21-42c3-851b-a0bd08eec77b', 'a8669d8f-ac1c-4d5a-ae23-a34057a04272',
  '1817b26c-3673-4385-a42c-b52fdd206f1e', '38dedc59-7c2a-49b2-b7a5-d6d9c8ffe426',
  'c90194eb-9ff5-490b-b2f6-f2624a1e3245', 'cf23bb20-3a5c-4691-89d8-95fc5bc0a13d',
  'ee9f1441-31a7-40ac-aeca-4f1b77621f1c', '9d3d2bd7-7fcc-4be3-8885-3378820af52c',
  '11f4bc6c-1f21-43c5-b0ca-aa75f0cc2980', '9c2c4530-71dd-4d40-ad37-3633825a97c0',
  'd78764c5-6700-497f-b52f-76f78a3617e6', '9b62d2d6-c674-4194-aa02-ba85fa41f875',
  '61247c5d-9886-47b9-89a4-71d887bb28d8'
);

-- 2. The specific case the user reported: only "drinks with MK" should
--    remain (expect 1 row).
select id, transaction_date, amount, description from public.transactions
where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3' and amount = -9.00
  and transaction_date between '2026-09-01' and '2026-09-08';

-- 3. Venmo account row count should now be 296 (309 - 13).
select count(*) from public.transactions where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3';
