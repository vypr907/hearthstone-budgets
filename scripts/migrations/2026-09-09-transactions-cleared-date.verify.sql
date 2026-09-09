-- Verify 2026-09-09-transactions-cleared-date.sql landed correctly.

-- 1. Column exists.
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'transactions' and column_name = 'cleared_date';

-- 2. Every cleared row now has a cleared_date (expect 0).
select count(*) as cleared_missing_date
from public.transactions
where status = 'cleared' and cleared_date is null;

-- 3. Every pending row still has none (expect 0 — sanity check the backfill
--    didn't touch pending rows).
select count(*) as pending_with_date
from public.transactions
where status = 'pending' and cleared_date is not null;

-- 4. Spot check: cleared_date should equal transaction_date for every row
--    right after the backfill (expect 0 mismatches — this will start
--    growing once the app records real different cleared dates).
select count(*) as mismatches
from public.transactions
where status = 'cleared' and cleared_date <> transaction_date;
