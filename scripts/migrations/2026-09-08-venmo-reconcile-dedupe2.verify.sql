-- Verify 2026-09-08-venmo-reconcile-dedupe2.sql landed correctly.
-- Run after the delete commits.

-- 1. All 6 ids should now be gone (expect 0 rows).
select id from public.transactions where id in (
  '05a9278e-1de6-49bd-9f5b-ce126e543590', 'c060acba-926c-4105-b235-e0d429af8182',
  '46115fa2-3773-4c40-84b8-3ec3362ad784', '983338c5-4d91-4700-a7da-b33237e5b536',
  '63dbe1f6-c2ec-4e14-aafa-3757eb917056', 'e98d71f1-a3a6-4dec-83ec-e1b20f1a0cd5'
);

-- 2. Their real counterparts should still be present (expect 4 rows: the
--    Finch bill+fee pair, the UberEats lump sum, and one Nature's Releaf).
select id, transaction_date, amount, description from public.transactions where id in (
  '0b4ad39a-9fec-4e2f-8fa7-e5831f35beef', '429bcb89-7567-424a-8869-9b86b9117025',
  'b6d1d803-3913-4bae-b952-884edae53a8b', 'f5f10c39-ad44-4587-ad4c-128195329ed9'
);

-- 3. The 4th Nature's Releaf entry (8/30, genuinely new, no duplicate)
--    should still be present untouched (expect 1 row, -63.00).
select id, transaction_date, amount from public.transactions where id = '396b4bc9-fc4f-4366-a16f-1f206db5155d';

-- 4. Venmo account row count should now be 290 (296 - 6).
select count(*) from public.transactions where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3';

-- 5. Recompute the account's "current" balance (anchor + cleared txns after
--    the latest snapshot) the same way the app does (src/lib/balances.ts).
--    Expect this to be much closer to the real ~$72 than the -$156 before.
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
