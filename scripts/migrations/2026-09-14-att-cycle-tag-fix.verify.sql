-- Verify 2026-09-14-att-cycle-tag-fix.sql landed correctly.

-- 1. Bill state (expect cycle_paid_to_date 0, payment_status unpaid,
--    cycle_amount_due 222.12 unchanged, next_due_date 2026-09-29 unchanged).
select cycle_paid_to_date, payment_status, cycle_amount_due, next_due_date
from public.bills where id = '34e2fb44-45ca-47fc-bb7c-01ef2bcff211';

-- 2. Payment row tagged (expect resolved_cycle_due_date 2026-08-29).
select id, transaction_date, amount, resolved_cycle_due_date
from public.transactions where id = 'e7ffe110-73a5-414b-bdad-b0fa7151e38d';
