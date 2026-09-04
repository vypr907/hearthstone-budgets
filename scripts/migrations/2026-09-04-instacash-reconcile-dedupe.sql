-- 2026-09-04 — Dedupe: 2026-09-04-instacash-reconcile.sql was accidentally run
-- twice, duplicating 3 rows (the second run's insert timestamps, 17:17:00 UTC,
-- vs the first run's 17:08:47 UTC). The one `update` statement in that script
-- is idempotent (same value both times) and needs no fix.
-- Data-only, "Our Household". Run in the Supabase SQL Editor. Wrap in a
-- transaction; review the verify script output before COMMIT.

begin;

-- Duplicate 6/20 $620 advance transaction (second run).
delete from public.transactions
where id = '775fdefd-fcf6-4808-a361-bf6e7e3f6677';

-- Duplicate matching debt_adjustments row (second run).
delete from public.debt_adjustments
where id = '9893f361-0b3b-4304-ad83-ce594b91b434';

-- Duplicate 7/17 $57.93 fee transaction (second run).
delete from public.transactions
where id = '136e6b01-d373-459f-af42-68d73670ea38';

commit;
