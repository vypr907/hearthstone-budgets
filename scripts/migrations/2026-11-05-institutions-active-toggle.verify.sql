-- Verify 2026-11-05-institutions-active-toggle.sql landed correctly.

-- 1. Column exists, right type/default/nullability.
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public' and table_name = 'institutions' and column_name = 'is_active';
-- expect: is_active | boolean | NO | true

-- 2. Every existing institution defaulted to active.
select count(*) as total, count(*) filter (where is_active) as active_count
from public.institutions;
-- expect: active_count = total
