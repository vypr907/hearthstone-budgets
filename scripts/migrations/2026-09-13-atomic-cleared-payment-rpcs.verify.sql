-- Verify 2026-09-13-atomic-cleared-payment-rpcs.sql.

-- 1. All three functions exist with the expected signature, security invoker.
select proname, pg_get_function_identity_arguments(oid) as args, prosecdef
from pg_proc
where proname in ('shift_billing_date', 'apply_cleared_debt_payment', 'apply_cleared_bill_payment')
  and pronamespace = 'public'::regnamespace;
-- expect: 3 rows, prosecdef = false (security invoker, not definer)

-- 2. shift_billing_date spot checks (pure — safe to run directly, no rows touched).
select
  shift_billing_date('2026-01-31', 'monthly', null, 1) as jan31_plus_1mo,      -- expect 2026-02-28
  shift_billing_date('2026-08-27', 'biweekly', null, 1) as aug27_plus_2wk,     -- expect 2026-09-10
  shift_billing_date('2026-09-13', 'custom', 10, 1) as custom_plus_10d,       -- expect 2026-09-23
  shift_billing_date('2026-09-13', 'one_time', null, 1) as onetime_noop,      -- expect 2026-09-13
  shift_billing_date('2026-01-15', 'quarterly', null, 1) as jan15_plus_1q,    -- expect 2026-04-15
  shift_billing_date('2026-01-15', 'annually', null, 1) as jan15_plus_1y;     -- expect 2027-01-15

-- 3. Smoke test against a throwaway delta on a real debt/bill, verified to
--    net back to the original state (run manually against rows you don't
--    mind touching twice in a row — see scripts/smoke/.pw/verify-cleared-payment.mjs
--    for the real, cleanup-safe TEST-household version of this).
