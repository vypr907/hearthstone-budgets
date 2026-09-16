-- Verify 2026-09-16-creditone-missionlane-reconciliation.sql landed correctly.

-- 1. Both stale pre-linking snapshots are gone (expect 0 rows).
select * from public.account_balances
where account_id in (
  'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
  '2875d7b3-630b-4a14-82f1-3241db3c225e'
);

-- 2. Mission Lane's 2 existing fee rows no longer carry linked_debt_id
--    (expect linked_debt_id = null on both).
select id, description, linked_debt_id from public.transactions
where id in ('751fac58-1bbd-4c2c-b0aa-5739f4639fdd', 'b5c9bc81-1546-4016-8608-79e7e39ec14c');

-- 3. Every transaction now on the CreditOne account, in order, with a
--    running total (expect the last row's running_delta = -278.63,
--    counting from starting_balance -299.14).
select transaction_date, status, amount, description, category_id, transfer_group_id, linked_bill_id,
       -299.14 + sum(amount) over (order by transaction_date, cleared_date
         rows between unbounded preceding and current row) as running_balance
from public.transactions
where account_id = 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f'
order by transaction_date, cleared_date;

-- 4. Every transaction now on the Mission Lane account, in order, with a
--    running total (expect the last row's running_delta = -1541.36,
--    counting from starting_balance -1709.55).
select transaction_date, status, amount, description, category_id, transfer_group_id, linked_bill_id,
       -1709.55 + sum(amount) over (order by transaction_date, cleared_date
         rows between unbounded preceding and current row) as running_balance
from public.transactions
where account_id = '2875d7b3-630b-4a14-82f1-3241db3c225e'
order by transaction_date, cleared_date;

-- 5. Both starting_balance + full ledger equal the expected current
--    balance (expect -278.63 and -1541.36).
select a.id, a.starting_balance
     + coalesce((select sum(t.amount) from public.transactions t
                 where t.account_id = a.id), 0) as balance
from public.accounts a
where a.id in ('ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f', '2875d7b3-630b-4a14-82f1-3241db3c225e');

-- 6. All 4 payment pairs are linked (expect 2 rows per transfer_group_id).
select transfer_group_id, count(*), array_agg(account_id) as accounts,
       array_agg(amount) as amounts
from public.transactions
where transfer_group_id in (
  'b3f7d2c0-0000-4000-8000-000000000001',
  'b3f7d2c0-0000-4000-8000-000000000002',
  'b3f7d2c0-0000-4000-8000-000000000003',
  'b3f7d2c0-0000-4000-8000-000000000004'
)
group by transfer_group_id;

-- 7. debts rows match (expect CreditOne: 278.63/90.00/2026-09-21;
--    Mission Lane: 1541.36/78.17/2026-09-27).
select id, remaining_balance, minimum_payment, next_due_date, payment_status, cycle_paid_to_date
from public.debts
where id in ('31a11f8f-36c5-4d5d-9246-27ae60f669a5', '3cc9ddca-9aa8-4f65-804a-7ec95836a9f7');
