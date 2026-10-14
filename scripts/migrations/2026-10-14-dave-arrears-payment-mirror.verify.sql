-- Verify 2026-10-14-dave-arrears-payment-mirror.sql landed correctly.
-- Run after the migration commits.

-- 1. The new mirror transaction exists on Dave ExtraCash, +$40.00,
--    2026-09-25 (expect 1 row).
select id, account_id, amount, status, transaction_date, cleared_date, description
from public.transactions
where id = '2523805b-2c19-4158-9c0c-0e2ada30b5cd';

-- 2. The original arrears payment row is untouched (expect 1 row,
--    unchanged amount/date/description).
select id, account_id, amount, status, transaction_date, description
from public.transactions
where id = '83b1c156-45e3-4bf6-8e43-c1c65a277264';

-- 3. Dave ExtraCash now nets to $0 owed (anchor -55.00 + 15.00 [9/24] +
--    40.00 [9/25] = 0). This mirrors what effectiveDebtBalance()/the
--    episode view will show live — not something this script can compute
--    directly without replaying the app's own balanceAsOf logic, but the
--    two queries above give everything needed to confirm by hand.
