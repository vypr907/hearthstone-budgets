-- Verify 2026-10-15-drop-stale-debt-rpc-overloads.sql landed correctly.
-- Run after the migration commits.

-- Exactly one overload of each function should remain, both with 4 args.
select p.proname, p.pronargs, pg_get_function_identity_arguments(p.oid) as args
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('apply_debt_advance', 'apply_debt_adjustment')
order by p.proname;
