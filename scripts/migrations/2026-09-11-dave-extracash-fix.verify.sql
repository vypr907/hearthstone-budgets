-- Verify 2026-09-11-dave-extracash-fix.sql.

select remaining_balance, minimum_payment, cycle_paid_to_date, payment_status, next_due_date
from public.debts where id = 'da042cbb-9173-46ab-8c8d-376dab131600';
-- expect: remaining_balance 110.00, minimum_payment 110.00,
--         cycle_paid_to_date 0.00, payment_status 'unpaid',
--         next_due_date '2026-09-10'
