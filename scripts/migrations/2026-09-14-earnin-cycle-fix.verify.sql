-- Verify 2026-09-14-earnin-cycle-fix.sql landed correctly.

-- Expect: remaining_balance 100.00, minimum_payment 100.00,
-- cycle_paid_to_date 0.00, payment_status unpaid, next_due_date 2026-09-24.
select remaining_balance, minimum_payment, cycle_paid_to_date, payment_status, next_due_date
from public.debts where id = '479bd94c-ce7f-4b04-91bb-a512e008cc01';
