-- Verification for 2026-09-03-strategy-lock-baseline.sql (ADR-095).
-- Read-only; safe to run via the Supabase MCP or SQL Editor.

-- 1. All six columns present and nullable.  expect: 6 rows, all is_nullable = YES
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'debt_strategy_settings'
  and column_name in (
    'strategy_locked_at',
    'locked_strategy',
    'locked_extra_monthly_payment',
    'locked_priority_order',
    'baseline_debt_free_date',
    'baseline_total_interest'
  )
order by column_name;

-- 2. Existing rows untouched — every lock column still null (nothing locked yet).
--    expect: every row all-null across the six columns
select household_id,
       strategy_locked_at,
       locked_strategy,
       locked_extra_monthly_payment,
       locked_priority_order,
       baseline_debt_free_date,
       baseline_total_interest
from public.debt_strategy_settings;

-- 3. Comments landed.  expect: 6 rows
select a.attname, d.description
from pg_description d
join pg_attribute a
  on a.attrelid = d.objoid and a.attnum = d.objsubid
where d.objoid = 'public.debt_strategy_settings'::regclass
  and a.attname like 'baseline_%' or a.attname like 'locked_%' or a.attname = 'strategy_locked_at'
order by a.attname;
