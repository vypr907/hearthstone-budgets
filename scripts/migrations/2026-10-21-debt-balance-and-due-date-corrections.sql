-- 2026-10-21 data corrections. Three separate problems, one file.
-- Verified against live data via the read-only MCP on 2026-10-21; all values
-- below are from that snapshot, nothing is recomputed at run time.
--
-- (1) PHANTOM BALANCE DRIFT — two debts whose stored remaining_balance is
--     lower than their surviving ledger supports, by an exact multiple of
--     their own minimum payment, with no debt_adjustments to explain it.
--     Cause: the debt detail screen's per-row "Delete transaction" button
--     (useDeleteLinkedTransaction, "the debt row is left as-is") removes a
--     payment row without restoring the balance. Both drifts are historical
--     — payments logged on 2026-10-21 moved both balances correctly.
--
--       Providence Alaska: start 174.66, 4 logged payments x 30 = 120,
--         so 54.66 should remain. Stored 0.00 (two phantom -30 reductions,
--         then the 4th payment clamped a 24.66 balance to zero at the RPC's
--         greatest(0, ...) floor, which also tripped date_paid_off).
--       Yukon Eye: start 127.80, 4 logged payments x 10 = 40, so 87.80
--         should remain. Stored 67.80 (two phantom -10 reductions).
--
-- (2) DUE DATES mis-set by 2026-10-17-stale-monthly-debt-due-dates-cleanup.sql.
--     That migration used "next upcoming due_day from today" without checking
--     whether the current month's payment had already been made, so it skipped
--     an unpaid October due date for four debts and under-advanced one whose
--     October payment was already in. Two more (Providence, Yukon Eye) then had
--     a later payment advance them a second time off the wrong starting point.
--     Correct rule, applied here: next_due_date = the due_day of the first
--     month whose cycle is NOT yet paid. Display-only for monthly items under
--     ADR-086 (cycle math uses the calendar month), so this misled the UI but
--     did not affect payment tracking.
--
-- (3) PAYMENT PLAN fields for Providence were never set (ADR-048):
--     on_payment_plan = true but plan_payment_count / plan_final_payment null.
--     The real plan is 5 payments of $30 plus a final $24.66 = $174.66.

-- (1) Balance corrections. date_paid_off is set to null explicitly rather than
-- relying on trg_sync_debt_date_paid_off's clear-on-rise behaviour (ADR-066
-- addendum) — same result, but it doesn't depend on trigger ordering.
update public.debts
set remaining_balance = 54.66, date_paid_off = null
where id = 'f4a918bf-f4dd-4a08-a4b7-307b66a8cb86'; -- Providence Alaska

update public.debts
set remaining_balance = 87.80
where id = 'd36ff965-b0cf-4e73-9378-897d4f5f836d'; -- Yukon Eye

-- (2) Due-date corrections.
update public.debts set next_due_date = v.new_due_date
from (values
  -- October's payment IS made -> next due is November's due_day
  ('f4a918bf-f4dd-4a08-a4b7-307b66a8cb86'::uuid, '2026-11-03'::date), -- Providence Alaska (paid 10-04; was 12-03)
  ('d36ff965-b0cf-4e73-9378-897d4f5f836d'::uuid, '2026-11-18'::date), -- Yukon Eye (paid 10-19; was 12-18)
  ('119ed5c8-883a-4a3e-9226-c9c6ff9eaf6f'::uuid, '2026-11-21'::date), -- Ticket 2 (paid 10-01; was 10-21)
  -- October's payment is NOT made -> next due is October's due_day, i.e. overdue
  ('9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c'::uuid, '2026-10-08'::date), -- Milestone (was 11-08)
  ('d48212ae-1bcd-433d-98e0-b23b90a61319'::uuid, '2026-10-01'::date), -- Mom (was 11-01)
  ('a1b5859d-f5b1-4433-8273-8063882cdfb6'::uuid, '2026-10-01'::date), -- North Star Radiology (was 11-01)
  ('334a7948-dadc-45de-8b6a-c8cb78048d72'::uuid, '2026-10-06'::date)  -- OPA/OrthoAlaska (was 11-06)
) as v(debt_id, new_due_date)
where debts.id = v.debt_id;

-- (3) Providence's payment plan: 5 x $30 + a final $24.66.
update public.debts
set plan_payment_count = 6, plan_final_payment = 24.66
where id = 'f4a918bf-f4dd-4a08-a4b7-307b66a8cb86';
