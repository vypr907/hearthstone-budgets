-- Verify 2026-11-03-cleo-next-due-date-fix.sql landed correctly.

-- 1. next_due_date should now be 2026-11-03, cycle_paid_to_date 0.
select next_due_date, cycle_paid_to_date, payment_status, remaining_balance, minimum_payment
from public.debts
where id = '085f2811-f7b3-4491-a32e-869a747dfd4b';

-- 2. Sanity: with next_due_date = today, computeArrears's walk never enters
-- its loop (cursor < today is false immediately), so cyclesMissed = 0 and
-- amountOverdue floors to 0 — "Past due" should read $0.00 for Cleo now.
