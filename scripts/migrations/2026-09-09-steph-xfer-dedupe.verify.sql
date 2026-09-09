-- Verify 2026-09-09-steph-xfer-dedupe.sql landed correctly.
-- Run after the delete commits.

-- 1. Both ids should now be gone (expect 0 rows).
select id from public.transactions where id in (
  'e9d23fdc-290e-46cf-ab70-2d27d13d64fe', 'cac58274-dba9-470c-abc5-896b1d6f68de'
);

-- 2. Exactly 3 Venmo<->Steph transfer pairs (6 legs) should remain in the
--    window, matching Venmo's 3 statement lines: 8/7 x2 (with fee), 8/13.
select transaction_date, account_id, amount, description, transfer_group_id
from public.transactions
where account_id in (
    '9a1a0f9a-c966-4038-a108-36766faf83d3',   -- Venmo - Steven
    'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1'    -- Steph One Checking
  )
  and transfer_group_id is not null
  and transaction_date between '2026-07-28' and '2026-08-20'
order by transaction_date, account_id;

-- 3. The two 8/7 transfer fees should still be present, each paired via
--    split_group_id to its own transfer_group_id (expect 2 rows, -0.44 each).
select id, transaction_date, amount, description, split_group_id
from public.transactions
where split_group_id in (
  '5c89d0d8-a812-4338-a497-d34965b7ef9e', '893659dd-4ed0-45d6-98c4-5712a6684132'
);
