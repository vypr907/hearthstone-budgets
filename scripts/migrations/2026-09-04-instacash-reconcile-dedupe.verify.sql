-- Verification for 2026-09-04-instacash-reconcile-dedupe.sql. Read-only.

-- 1. Full Instacash transaction history, oldest first.  expect: 12 rows —
--    6/20 +620 (Advance), 7/17 -385.10 (Debt payment), 7/17 -57.93 (Fee),
--    7/20 -234.90, 7/27 +600, 7/31 -600, 8/1 +600, 8/14 -600, 8/17 +300,
--    8/18 +300, 8/28 -600, 8/28 +600 — no duplicates.
select transaction_date, amount, description,
       (select name from accounts where id = account_id) as acct
from public.transactions
where linked_debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d'
order by transaction_date, amount desc;

-- 2. debt_adjustments — exactly 6 advance rows, one per date.
select adjustment_date, amount, adjustment_type
from public.debt_adjustments
where debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d'
order by adjustment_date;

-- 3. Reconciliation.  expect: advances 3020.00, repaid 2420.00, net 600.00,
--    stored_balance 600.00
select
  (select coalesce(sum(amount), 0) from public.transactions
   where linked_debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d'
     and description like 'Advance: %') as advances,
  (select coalesce(sum(-amount), 0) from public.transactions
   where linked_debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d'
     and description like 'Debt payment %') as repaid,
  (select coalesce(sum(amount), 0) from public.transactions
   where linked_debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d'
     and description like 'Advance: %')
  -
  (select coalesce(sum(-amount), 0) from public.transactions
   where linked_debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d'
     and description like 'Debt payment %') as net,
  (select remaining_balance from public.debts
   where id = 'e598a47c-5c39-46ad-b289-4127bd46683d') as stored_balance;

-- 4. No duplicate transaction_date + amount + description rows remain.  expect: 0 rows
select transaction_date, amount, description, count(*)
from public.transactions
where linked_debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d'
group by transaction_date, amount, description
having count(*) > 1;
