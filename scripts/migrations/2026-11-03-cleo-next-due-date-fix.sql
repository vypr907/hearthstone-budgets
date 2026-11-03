-- 2026-11-03 — Fix: Cleo's stale next_due_date was inflating "Past due" to
-- $147.02. Data-only. Run in the Supabase SQL Editor. No schema change.
--
-- Root cause: next_due_date was stuck at 2026-09-24 since before this
-- session — 2026-11-03-venmo-reconcile-sep-oct.sql only updated
-- remaining_balance/minimum_payment, never next_due_date/cycle_paid_to_date.
-- computeArrears (src/lib/arrears.ts) walks every biweekly interval between
-- next_due_date and today, multiplying each by the CURRENT minimum_payment —
-- harmless while minimum_payment was $0.00, but once that migration set it
-- to $55.00, the same stale date suddenly counted 3 fictional missed cycles
-- (165.00) minus the pre-existing arrears_paid_to_date (17.98) = 147.02.
--
-- Fix: move next_due_date to the boundary of the one draw that's actually
-- still open (10/20 advance + 14-day biweekly interval = 2026-11-03, today),
-- confirmed with the user. cycle_paid_to_date reset to 0 for that cycle
-- (already 0 live; set explicitly for clarity). payment_status stays
-- 'unpaid' (unchanged, already correct).
--
-- Does not touch remaining_balance/minimum_payment (55.00, already correct)
-- or arrears_paid_to_date (17.98, pre-existing, unrelated to this fix).

begin;

update public.debts
set next_due_date = '2026-11-03',
    cycle_paid_to_date = 0
where id = '085f2811-f7b3-4491-a32e-869a747dfd4b';

commit;
