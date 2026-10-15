-- 2026-10-15 — Drop the old 3-arg apply_debt_advance/apply_debt_adjustment
-- overloads left behind by 2026-10-14-linked-advance-balance-override.sql.
--
-- `create or replace function` only replaces a function with the EXACT
-- SAME parameter list — adding a new trailing parameter (even with a
-- default) makes Postgres treat it as a completely separate overload
-- instead of replacing the original. Confirmed live: both functions now
-- exist twice (3-arg, still the old buggy body; 4-arg, the fixed one).
-- Any caller that only passes the original 3 named arguments resolves to
-- the still-live OLD function, not the fixed one with its 4th parameter
-- defaulting to null — silently undoing yesterday's fix for exactly that
-- call shape.
--
-- Dropping the old 3-arg signatures leaves only the new 4-arg version
-- (its default makes it callable with 3 or 4 named arguments either
-- way), so every caller — old or new — resolves unambiguously to the one
-- correct function.

begin;

drop function if exists public.apply_debt_advance(uuid, numeric, date);
drop function if exists public.apply_debt_adjustment(uuid, numeric, date);

commit;
