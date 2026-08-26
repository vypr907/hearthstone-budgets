-- 2026-08-26 — RLS hardening (ADR-083, ADR-081 addendum)
-- Run in the Supabase SQL Editor. Schema/permission change — not a code change.
--
-- Part 1 fixes a real bug: auto_transfers shipped (ADR-081) with RLS DISABLED,
--   so any authenticated user could read/write any household's auto-transfers.
--   This is REQUIRED — it is the one hole in the test-write boundary and a
--   live app security issue.
--
-- Part 2 adds `force row level security` on every table. Honest note: with
--   these tables all owned by `postgres` (which has rolbypassrls = true), FORCE
--   is effectively a no-op today — a BYPASSRLS role bypasses RLS regardless of
--   FORCE. It is cheap future-proofing: if a table is ever created/owned by a
--   role without BYPASSRLS, FORCE makes its policies apply to that owner too.
--   Verified safe here: is_household_member() is SECURITY DEFINER owned by
--   `postgres` (bypasses RLS), so FORCE on household_members does not cause
--   policy recursion. The load-bearing rule for keeping automated tests off the
--   real household is NOT this — it is: never hand the test tooling the
--   service_role key or a direct `postgres` connection string. See ADR-083.
--   Part 2 is optional; Part 1 is not.

-- ── Part 1: enable RLS on auto_transfers ──────────────────────────────────────
alter table public.auto_transfers enable row level security;

drop policy if exists "household access" on public.auto_transfers;
create policy "household access" on public.auto_transfers
  for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

-- ── Part 2: force RLS on every public data table ──────────────────────────────
alter table public.account_balances            force row level security;
alter table public.accounts                    force row level security;
alter table public.auto_transfers              force row level security;
alter table public.bill_adjustments            force row level security;
alter table public.bills                       force row level security;
alter table public.categories                  force row level security;
alter table public.debt_adjustments            force row level security;
alter table public.debt_strategy_settings      force row level security;
alter table public.debts                       force row level security;
alter table public.deduction_payment_events    force row level security;
alter table public.household_members           force row level security;
alter table public.households                  force row level security;
alter table public.income_events               force row level security;
alter table public.income_source_deductions    force row level security;
alter table public.income_source_splits        force row level security;
alter table public.income_sources              force row level security;
alter table public.institution_categories      force row level security;
alter table public.institutions                force row level security;
alter table public.pay_period_allocations      force row level security;
alter table public.payment_schedule_checkoffs  force row level security;
alter table public.savings_goals               force row level security;
alter table public.spending_actuals            force row level security;
alter table public.spending_budgets            force row level security;
alter table public.transactions                force row level security;

notify pgrst, 'reload schema';

-- ── Verify (expect: 0 rows) ──────────────────────────────────────────────────
select c.relname, c.relrowsecurity, c.relforcerowsecurity
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
  and (c.relrowsecurity = false or c.relforcerowsecurity = false);
