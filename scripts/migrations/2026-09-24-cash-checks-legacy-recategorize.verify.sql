-- Verify 2026-09-24-cash-checks-legacy-recategorize.sql landed correctly.
-- Run after the migration commits.

-- 1. Both rows now categorized "Green", not "Cash & Checks" (expect 2 rows,
--    both category_id = 708cce35-a411-4d48-a873-4e9dd48536ed).
select id, transaction_date, amount, description, category_id
from public.transactions
where id in (
  '42abaea3-10f0-404f-84bb-aa2c7d7a705f',
  '238c8495-3362-428a-870d-1028fcb7737f'
);

-- 2. "Cash & Checks" category now has zero transactions referencing it
--    (expect 0 rows) — confirms the category is fully retired.
select count(*) as remaining_cash_checks_rows
from public.transactions
where category_id = '92810d6e-371e-458d-94c7-7cb53539188d';
