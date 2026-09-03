-- ADR-095: Strategy lock + baseline snapshot.
-- Run manually in the Supabase SQL Editor. Additive, nullable columns only —
-- no backfill, no RLS change (debt_strategy_settings is already household-scoped
-- and the app already UPDATEs the row). null in every column = unlocked =
-- today's behaviour.

alter table public.debt_strategy_settings
  add column if not exists strategy_locked_at            timestamptz,
  add column if not exists locked_strategy               text,
  add column if not exists locked_extra_monthly_payment  numeric,
  add column if not exists locked_priority_order         jsonb,
  add column if not exists baseline_debt_free_date       date,
  add column if not exists baseline_total_interest       numeric;

comment on column public.debt_strategy_settings.strategy_locked_at is
  'ADR-095: when the payoff plan was locked; null = unlocked (default behaviour).';
comment on column public.debt_strategy_settings.locked_strategy is
  'ADR-095: active_strategy frozen at lock time.';
comment on column public.debt_strategy_settings.locked_extra_monthly_payment is
  'ADR-095: extra_monthly_payment frozen at lock time.';
comment on column public.debt_strategy_settings.locked_priority_order is
  'ADR-095: JSON array of debt-id strings — the Custom payoff order frozen at lock.';
comment on column public.debt_strategy_settings.baseline_debt_free_date is
  'ADR-095: first-of-month of the projected payoff month from the sim run at lock. Display only, never read back into engine math (ADR-015 exception).';
comment on column public.debt_strategy_settings.baseline_total_interest is
  'ADR-095: projected total interest from the sim run at lock. Display only.';
