-- Verification for 2026-09-01-enforce-debt-payoff-date.sql (ADR-066 addendum).
-- Read-only; safe to run via the Supabase MCP or SQL Editor.

-- 1. Trigger + function installed.  expect: 1 row (trg_sync_debt_date_paid_off, BEFORE INSERT/UPDATE)
select t.tgname, pg_get_triggerdef(t.oid) as definition
from pg_trigger t
where t.tgrelid = 'public.debts'::regclass
  and t.tgname = 'trg_sync_debt_date_paid_off';

-- 2. Function body present.  expect: 1 row
select proname, prosecdef, pg_get_functiondef(oid) is not null as has_body
from pg_proc
where proname = 'sync_debt_date_paid_off';

-- 3. Invariant holds: no settled non-Advance debt without a payoff date.  expect: 0 rows
select id, name, debt_type, remaining_balance, date_paid_off
from public.debts
where lower(coalesce(debt_type, '')) <> 'advance'
  and coalesce(remaining_balance, 0) <= 0.005
  and date_paid_off is null;

-- 4. Reverse invariant: no open non-Advance debt still carrying a payoff date.  expect: 0 rows
select id, name, debt_type, remaining_balance, date_paid_off
from public.debts
where lower(coalesce(debt_type, '')) <> 'advance'
  and coalesce(remaining_balance, 0) > 0.005
  and date_paid_off is not null;

-- 5. What the backfill populated (sanity-check the dates look like real payment dates).
select id, name, debt_type, remaining_balance, date_paid_off
from public.debts
where lower(coalesce(debt_type, '')) <> 'advance'
  and coalesce(remaining_balance, 0) <= 0.005
order by date_paid_off desc
limit 50;

-- 6. Advances untouched by the invariant (zero balance, may or may not have a date).  informational
select id, name, remaining_balance, date_paid_off
from public.debts
where lower(coalesce(debt_type, '')) = 'advance'
order by name;
