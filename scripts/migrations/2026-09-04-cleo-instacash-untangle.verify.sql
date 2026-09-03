-- Verification for 2026-09-04-cleo-instacash-untangle.sql. Read-only.

-- 1. Cleo Plus bill — exactly 3 payments: 7/2, 8/3, 9/1, all -5.99.  expect: 3 rows
select transaction_date, amount, (select name from accounts where id = account_id) as acct
from public.transactions
where linked_bill_id = '8da52c79-c266-4b69-acde-5f22cf8c42db'
order by transaction_date;

-- 2. Cleo advance debt — deposit (+40, linked), repayment (-40), fee (-6.99).  expect: 3 rows
select transaction_date, amount, description,
       (select name from accounts where id = account_id) as acct
from public.transactions
where linked_debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b'
order by transaction_date, amount desc;

-- 3. No Cleo rows still tied to the bill by mistake / no orphan split.  expect: 0 rows
select id, description, amount, split_group_id
from public.transactions
where split_group_id = 'ca55e954-7dae-43cf-98e1-1dc28d814dc8';

-- 4. Instacash — balance and minimum both 600.00.  expect: 1 row, 600.00 / 600.00
select remaining_balance, minimum_payment, date_paid_off
from public.debts
where id = 'e598a47c-5c39-46ad-b289-4127bd46683d';

-- 5. The 7/17 payment is unlinked but still a cleared Classic Checking expense.  expect: 1 row, linked_debt_id null
select transaction_date, amount, status, linked_debt_id,
       (select name from accounts where id = account_id) as acct
from public.transactions
where id = 'd48527f7-2ab7-4ce4-99d2-d55f962c1ad8';

-- 6. Every advance deposit now carries linked_debt_id.  expect: 0 rows
select id, description, transaction_date, amount
from public.transactions
where household_id = 'cd8bce8c-81af-4302-8019-113e352ed443'
  and description like 'Advance: %'
  and transfer_group_id is not null
  and amount > 0
  and linked_debt_id is null;

-- 7. Instacash reconciliation — advances vs kept repayments (informational).
select 'advances'  as side, sum(amount) as total from public.debt_adjustments
where debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d' and adjustment_type = 'advance'
union all
select 'repayments' as side, sum(-amount) from public.transactions
where linked_debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d';
