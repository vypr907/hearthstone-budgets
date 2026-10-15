-- Verify 2026-10-15-earnin-balance-reconcile.sql landed correctly.
-- Run after the migration commits.

select id, name, remaining_balance, minimum_payment, cycle_paid_to_date, payment_status, arrears_paid_to_date, next_due_date
from public.debts
where id = '479bd94c-ce7f-4b04-91bb-a512e008cc01';
