-- Verify 2026-09-09-gci-cycle-fix.sql landed correctly.

-- 1. Bill state (expect cycle_paid_to_date 0, cycle_amount_due null,
--    payment_status unpaid, next_due_date 2026-10-05).
select cycle_paid_to_date, cycle_amount_due, payment_status, next_due_date
from public.bills where id = '0a07125f-c36b-4bc6-97e2-5a34516fa5c3';

-- 2. Payment row tagged (expect resolved_cycle_due_date 2026-09-05).
select id, transaction_date, amount, resolved_cycle_due_date
from public.transactions where id = '38b69270-c1a3-4fc2-9453-dd31c2723350';
