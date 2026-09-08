-- Verify 2026-09-08-venmo-reconcile.sql landed correctly.
-- Run after the migration commits.

-- 1. Row count added: expect 182 new rows total (some statements insert 2-3 rows each; see below).
select count(*) as venmo_rows_since_migration
from public.transactions
where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3'
  and created_at > (select max(created_at) - interval '1 hour' from public.transactions where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3');

-- 2. Re-run the reconciliation script (node scripts/reconcile-venmo-csv.mjs after
--    re-pulling the app-venmo-transactions.json snapshot) and confirm every
--    previously-"missing" row now classifies as "matched".

-- 3. Spot-check the big outlier landed correctly.
select * from public.transactions
where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3' and transaction_date = '2026-07-27' and amount < -1000;

-- 4. Confirm the Milestone debt payment linked correctly.
select * from public.transactions
where linked_debt_id = '9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c' and transaction_date = '2026-07-28';

-- 5. Confirm all 4 new institutions were created exactly once each.
select name, count(*) from public.institutions
where id in ('9ee04161-b1ce-4146-aaad-6f744df76310', '2f4cecec-e803-46b8-8e76-0806064a27dc', 'ca5031c3-5c58-490d-ab2b-7779218c9a5c', '4043c8be-7c50-4077-a369-ade9272371fa')
group by name;
