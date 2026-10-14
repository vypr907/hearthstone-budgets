-- Verify 2026-10-14-dave-overdraft-fee-mirrors.sql landed correctly.
-- Run after the migration commits.

-- 1. Both new mirror transactions exist on Dave ExtraCash, -$5.00 each,
--    dated 2026-09-04 (expect 2 rows).
select id, account_id, amount, status, transaction_date, description
from public.transactions
where id in (
  '6bc4327d-9269-4388-aeaf-89076d76d811',
  '446f0621-87be-49b5-bd47-60c1cf59dc11'
);

-- 2. Both debt_adjustments rows now point at their new mirror (expect 2
--    rows, mirror_transaction_id matching the ids above).
select id, amount, adjustment_type, description, mirror_transaction_id
from public.debt_adjustments
where id in (
  'a5c12d6c-c5e6-4c05-b6f5-1cfcee894d42',
  '9e284c95-2d99-4049-8a2f-9f8d43672f8c'
);
