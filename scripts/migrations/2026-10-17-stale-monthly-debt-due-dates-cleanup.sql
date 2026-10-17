-- ADR-086 addendum (2026-10-17), data cleanup. The RPC fix in
-- 2026-10-17-monthly-debt-next-due-date-rollforward.sql only prevents
-- FUTURE staleness — it doesn't retroactively repair rows that were already
-- frozen by the bug. These 11 "Our Household" monthly debts are all
-- currently fully resolved (payment_status = 'cleared', cycle_paid_to_date =
-- 0, nothing owed) but their next_due_date is stuck 9-89 days in the past.
--
-- Each is set to the next upcoming occurrence of the debt's own due_day
-- from today (2026-10-17) — not a reconstruction of exact payment history
-- (which is unreliable for at least two of these: "Ticket 1"'s last
-- matching cleared-payment row is from April, long before its stored
-- August due date, and "Mom" has no matching cleared-payment row at all,
-- likely paycheck-deduction-funded — ADR-032). Since all 11 are already
-- fully paid with nothing owed, "what should show as next due, right now"
-- is the safe, unambiguous question to answer; reconstructing "exactly
-- which past cycles were silently skipped" is not needed for that and
-- risks writing a wrong date for the two irregular cases above.
--
-- Verified via the read-only MCP against live data on 2026-10-17 — IDs and
-- dates below are specific to that snapshot, not recomputed at run time.

update public.debts set next_due_date = v.new_due_date
from (values
  ('9e0d613c-e5d7-4a95-b461-a429650afbea'::uuid, '2026-10-20'::date), -- Car
  ('9680bbb9-671d-48cf-9ce0-d57613e22db0'::uuid, '2026-10-18'::date), -- Alpine Medical - Stephanie
  ('a1b5859d-f5b1-4433-8273-8063882cdfb6'::uuid, '2026-11-01'::date), -- North Star Radiology
  ('d48212ae-1bcd-433d-98e0-b23b90a61319'::uuid, '2026-11-01'::date), -- Mom
  ('f4a918bf-f4dd-4a08-a4b7-307b66a8cb86'::uuid, '2026-11-03'::date), -- Providence Alaska
  ('334a7948-dadc-45de-8b6a-c8cb78048d72'::uuid, '2026-11-06'::date), -- OPA/OrthoAlaska
  ('d36ff965-b0cf-4e73-9378-897d4f5f836d'::uuid, '2026-10-18'::date), -- Yukon Eye
  ('119ed5c8-883a-4a3e-9226-c9c6ff9eaf6f'::uuid, '2026-10-21'::date), -- Ticket 2
  ('6585e72d-b0a2-4a65-bb5b-2c2df43160f0'::uuid, '2026-10-21'::date), -- Ticket 1
  ('8004b659-7e01-4630-8e76-bea58065ab16'::uuid, '2026-10-21'::date), -- Aarons - Dresser
  ('3cc9ddca-9aa8-4f65-804a-7ec95836a9f7'::uuid, '2026-10-27'::date), -- Mission Lane
  ('9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c'::uuid, '2026-11-08'::date)  -- Milestone
) as v(debt_id, new_due_date)
where debts.id = v.debt_id;
