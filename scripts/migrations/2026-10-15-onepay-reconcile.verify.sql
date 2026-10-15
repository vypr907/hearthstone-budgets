-- Verify 2026-10-15-onepay-reconcile.sql landed correctly.
-- Run after the migration commits.

-- 1. Both new debt_adjustments rows exist (expect 2 rows).
select id, amount, adjustment_type, description, adjustment_date
from public.debt_adjustments
where id in (
  '7f6a8559-e65c-45aa-a152-375688225e44',
  'a763bc3a-a98d-4ad3-8fe3-81604540abac'
);

-- 2. Both retagged transactions now point at the debt with the right
--    description (expect 2 rows).
select id, amount, description, linked_debt_id, transaction_date
from public.transactions
where id in (
  '3a8d7ef3-e289-4c76-b217-19a70708f562',
  '288cafd8-8e8a-474c-abbf-dd4b9f0c28a6'
);

-- 3. The debt row now reads $231.75/$231.75/unpaid/2026-10-08.
select id, name, remaining_balance, minimum_payment, cycle_paid_to_date, payment_status, next_due_date
from public.debts
where id = 'a1581069-a274-4ef5-91a5-690943fed672';
