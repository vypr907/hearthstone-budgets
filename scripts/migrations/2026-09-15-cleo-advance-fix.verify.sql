-- Verify 2026-09-15-cleo-advance-fix.sql landed correctly.

-- 1. Debt state (expect remaining_balance 110.00, minimum_payment 110.00,
--    cycle_paid_to_date 0.00 unchanged, next_due_date 2026-09-10 unchanged).
select remaining_balance, minimum_payment, cycle_paid_to_date, payment_status, next_due_date
from public.debts where id = '085f2811-f7b3-4491-a32e-869a747dfd4b';

-- 2. The missing 7/9 advance now exists (adjustment + transaction).
select adjustment_date, amount, adjustment_type from public.debt_adjustments
where debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b' and adjustment_date = '2026-07-09';
select transaction_date, amount, description from public.transactions
where linked_debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b' and transaction_date = '2026-07-09';

-- 3. The erroneous fee entries are gone.
select count(*) as should_be_zero from public.debt_adjustments
where id = '7ba202e9-ddbe-45f3-84e8-96f8b090cd2b';
select count(*) as should_be_zero from public.transactions
where id = 'fbb1dc2e-9dee-463e-ba4d-dc28fe4fe848';

-- 4. Two new $8.99 fee rows exist, both dated 9/13.
select transaction_date, amount, description from public.transactions
where linked_debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b' and amount = -8.99
order by description;

-- 5. Full advance/repayment tally for this debt should net to 110.00:
--    advances (debt_adjustments, type='advance') minus real repayments
--    (linked "Debt payment" transactions, excluding "Fee:" rows).
select
  (select coalesce(sum(amount), 0) from public.debt_adjustments
   where debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b' and adjustment_type = 'advance')
  +
  (select coalesce(sum(amount), 0) from public.transactions
   where linked_debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b'
     and description like 'Debt payment%')
  as net_should_be_110;
