-- Verify 2026-09-11-one-checking-aaron-stash-fredmeyer-fix.sql.

-- 1. Aaron's cluster now sums to the exact Aug 22 statement charge, -540.33.
select sum(amount) as aaron_cluster_total from public.transactions
where id in (
  '44672d2f-39c3-4dd9-8caf-044458d23dd8',  -- Dresser paid -97.10
  '89263adb-6ae3-4f35-af74-6e56d2f242d4',  -- Dresser Protection Plus -9.20
  '886faf5f-9acf-42ce-a27c-c4f3a97d603d',  -- Aarons paid -394.57 (was -434.03)
  '38b3557f-cb9f-4ef7-a01e-270dd96e4aaf'   -- Aarons Protection Plus -39.46
);

-- 2. Stash Aug 4 now -12.00.
select id, amount from public.transactions where id = '198d5917-973b-4c0a-bab2-d3eca25f84d7';

-- 3. Fred Meyer Fuel now cleared 8/31, still dated 8/30.
select id, transaction_date, cleared_date, amount from public.transactions
where id = 'd7029670-8b92-4134-afc2-80f9e0fead9b';

-- 4. One Checking current balance unchanged (~119.15) — the fixes land
--    before the 8/31 anchor, which absorbs them.
select
  (select balance from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1) as anchor,
  (select coalesce(sum(amount),0) from public.transactions where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' and status = 'cleared'
     and coalesce(cleared_date, transaction_date) > (select as_of_date from public.account_balances where account_id = '40124cdf-70bf-4923-8f1e-a7395a85e902' order by as_of_date desc limit 1)) as cleared_after_anchor;
