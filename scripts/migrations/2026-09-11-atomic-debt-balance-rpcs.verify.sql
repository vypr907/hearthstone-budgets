-- Verify 2026-09-11-atomic-debt-balance-rpcs.sql.

-- 1. Both functions exist with the expected signature.
select proname, pg_get_function_identity_arguments(oid) as args, prosecdef
from pg_proc
where proname in ('apply_debt_advance', 'apply_debt_adjustment')
  and pronamespace = 'public'::regnamespace;
-- expect: 2 rows, prosecdef = false (security invoker, not definer)

-- 2. Smoke test against a throwaway delta on a real debt, verified to net to
--    zero (run manually, optional — replace <debt_id> with a real id you
--    don't mind touching twice in a row; this nets out and touches nothing
--    else):
-- select remaining_balance from apply_debt_advance('<debt_id>'::uuid, 0.01);
-- select remaining_balance from apply_debt_adjustment('<debt_id>'::uuid, -0.01, current_date);
-- (second call's remaining_balance should be back to the original value)
