-- Verify 2026-09-16-milestone-statement-reconciliation.sql landed correctly.

-- 1. Stale pre-linking snapshot is gone (expect 0 rows).
select * from public.account_balances
where account_id = '4785cf79-7462-4f13-9bac-a5de6f253614';

-- 2. Every transaction now on the Milestone account, in order (expect 5
--    rows: 06/15 -10.00, 07/28 +20.00, 07/29 -8.95, 08/03 -8.95,
--    09/11 +20.00 — and the derived running total).
select transaction_date, cleared_date, status, amount, description,
       category_id, transfer_group_id,
       sum(amount) over (order by transaction_date, cleared_date
         rows between unbounded preceding and current row) as running_delta
from public.transactions
where account_id = '4785cf79-7462-4f13-9bac-a5de6f253614'
order by transaction_date, cleared_date;

-- 3. starting_balance + every transaction above should equal -276.35
--    (expect balance = -276.35).
select a.starting_balance
     + coalesce((select sum(t.amount) from public.transactions t
                 where t.account_id = a.id), 0) as balance
from public.accounts a
where a.id = '4785cf79-7462-4f13-9bac-a5de6f253614';

-- 4. Both payment pairs are linked (expect 2 rows per transfer_group_id).
select transfer_group_id, count(*), array_agg(account_id) as accounts,
       array_agg(amount) as amounts
from public.transactions
where transfer_group_id in (
  'a2e6c1a0-0000-4000-8000-000000000001',
  'a2e6c1a0-0000-4000-8000-000000000002'
)
group by transfer_group_id;

-- 5. debts row matches (expect remaining_balance 276.35, minimum_payment
--    20.00, next_due_date 2026-10-08).
select remaining_balance, minimum_payment, next_due_date, payment_status
from public.debts
where id = '9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c';
