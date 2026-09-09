-- 2026-09-09 — Correct a stuck GCI bill cycle after a manual "mark paid".
--
-- GCI is a variable-amount bill; bills.amount (the standing/typical figure
-- used to pre-fill the "Amount owed this cycle" prompt) is stale at $124.99
-- — doesn't match either real amount seen this cycle ($385.52 in August,
-- $64.51 in September, per the USAA reconciliation). When the user marked
-- the $64.51 September payment paid, the pre-filled $124.99 default for
-- "Amount owed this cycle" wasn't overwritten, so ensureCycleAmount()
-- (src/lib/payments.ts) wrote cycle_amount_due = 124.99 instead of 64.51.
-- The $64.51 payment then credited against a $124.99 target, leaving the
-- bill "Partial" with $60.48 apparently still owed — confirmed live via
-- MCP: cycle_amount_due=124.99, cycle_paid_to_date=64.51, exactly a $60.48
-- shortfall. bills.amount itself is left alone per the user (GCI's real
-- amount varies every cycle, so it's only ever a starting guess anyway).
--
-- This migration applies the same resolve applyClearedPayment() would have
-- performed had cycle_amount_due correctly been $64.51 to start with:
-- cycle_paid_to_date/cycle_amount_due reset, payment_status -> unpaid,
-- next_due_date advanced one month (2026-09-05 -> 2026-10-05, via
-- src/lib/format.ts's shiftDate/addMonths — confirmed no month-end
-- day-overflow edge case for the 5th), and the payment transaction tagged
-- with the due date it resolved (ADR-075), matching every other resolved
-- GCI payment.

begin;

update public.bills
set
  cycle_paid_to_date = 0,
  cycle_amount_due = null,
  payment_status = 'unpaid',
  next_due_date = '2026-10-05'
where id = '0a07125f-c36b-4bc6-97e2-5a34516fa5c3';

update public.transactions
set resolved_cycle_due_date = '2026-09-05'
where id = '38b69270-c1a3-4fc2-9453-dd31c2723350';

commit;
