-- Verify 2026-10-14-linked-advance-balance-override.sql landed correctly.
-- Run after the migration commits.

-- 1. Dave ExtraCash now reads $110/$110/2026-10-22 (expect 1 row).
select id, name, remaining_balance, minimum_payment, next_due_date, payment_status
from public.debts
where id = 'da042cbb-9173-46ab-8c8d-376dab131600';

-- 2. Both functions now accept the new 4th parameter (expect 2 rows,
--    pronargs = 4 for apply_debt_advance, 4 for apply_debt_adjustment).
select p.proname, p.pronargs
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('apply_debt_advance', 'apply_debt_adjustment');
