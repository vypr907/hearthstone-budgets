-- Verify 2026-09-24-atomic-payment-undo-rpcs.sql landed correctly.
-- Run after the migration commits. This migration creates functions only
-- (no data change) — full behavioral verification happens separately via
-- the TEST-household smoke script (ADR-083) before these are relied on.

-- 1. All 11 functions exist, are security invoker, and live in `public`
--    (expect 11 rows).
select
  p.proname as function_name,
  case p.prosecdef when false then 'invoker' else 'definer' end as security,
  pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'rebuild_bill_cycle_amount_due',
    'apply_debt_mark_unpaid', 'apply_bill_mark_unpaid',
    'apply_debt_cycle_reset', 'apply_bill_cycle_reset',
    'apply_debt_payment_reversal', 'apply_bill_payment_reversal',
    'rollback_cleared_debt_payment', 'rollback_cleared_bill_payment',
    'correct_cleared_debt_payment', 'correct_cleared_bill_payment'
  )
order by p.proname;

-- 2. None of them are SECURITY DEFINER (expect 0 rows — every row from #1
--    should show 'invoker').
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in (
    'rebuild_bill_cycle_amount_due',
    'apply_debt_mark_unpaid', 'apply_bill_mark_unpaid',
    'apply_debt_cycle_reset', 'apply_bill_cycle_reset',
    'apply_debt_payment_reversal', 'apply_bill_payment_reversal',
    'rollback_cleared_debt_payment', 'rollback_cleared_bill_payment',
    'correct_cleared_debt_payment', 'correct_cleared_bill_payment'
  )
  and p.prosecdef = true;
