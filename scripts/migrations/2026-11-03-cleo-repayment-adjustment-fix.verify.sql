-- Verify 2026-11-03-cleo-repayment-adjustment-fix.sql landed correctly.

-- 1. Both spurious rows should be gone — expect 0 rows.
select * from public.debt_adjustments
where id in ('e5b349e9-dd7f-48f8-b6ed-59cba6fa5f0a', 'bc931f1e-2917-4c8a-87f4-d53360175481');

-- 2. Cleo's remaining debt_adjustments should be exactly the 6 real 'advance'
-- markers (40, 40, 55, 55, 55, 55, 55 — 7 total across the debt's history),
-- no 'repayment' rows at all.
select adjustment_date, amount, adjustment_type from public.debt_adjustments
where debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b'
order by adjustment_date;

-- 3. remaining_balance/minimum_payment unaffected by this fix, still 55.00.
select remaining_balance, minimum_payment from public.debts
where id = '085f2811-f7b3-4491-a32e-869a747dfd4b';
