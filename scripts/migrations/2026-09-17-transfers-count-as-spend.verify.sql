-- Verify 2026-09-17-transfers-count-as-spend.sql landed correctly.

-- 1. Column exists, not null, defaults false.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_name = 'accounts' and column_name = 'transfers_count_as_spend';

-- 2. Exactly the 2 intended accounts are flagged true.
select id, name, transfers_count_as_spend
from public.accounts
where transfers_count_as_spend = true
order by name;

-- 3. Nothing else was touched — every other account still defaults false.
select count(*) as accounts_still_false
from public.accounts
where transfers_count_as_spend = false;
