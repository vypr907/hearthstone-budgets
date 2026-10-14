-- 2026-10-14 — Backfill the missing mirror for Dave ExtraCash's real $40
-- repayment, logged 2026-09-25 via "Log arrears payment" instead of a
-- regular debt payment (ADR-111 addendum).
--
-- useMarkArrearsPaid (ADR-076) only ever updates arrears_paid_to_date —
-- it never touches remaining_balance or writes a mirror transaction onto a
-- linked account. The user confirmed this $40 was actually the real
-- repayment settling the current $50 advance + $5 fee (not a separate
-- cycle-lateness catch-up), so without a mirror on Dave ExtraCash's own
-- account, the balance still reads $40 owed instead of $0 — the live
-- anchor-based calc only sees activity that's actually posted to the
-- account itself.
--
-- The original "Arrears payment · Dave ExtraCash" row
-- (83b1c156-45e3-4bf6-8e43-c1c65a277264, -40.00, 2e937b2d..., 2026-09-25)
-- is left exactly as-is — this only adds the missing other leg, matching
-- the shape useLogDebtPayment would have written had the user used that
-- flow instead.
--
-- Our Household (cd8bce8c-81af-4302-8019-113e352ed443):
--   debt             Dave ExtraCash   da042cbb-9173-46ab-8c8d-376dab131600
--   linked account   Dave ExtraCash   e62e92f6-5029-4ce2-b28c-23c3db6dc50e

begin;

insert into public.transactions
  (id, household_id, account_id, amount, status, description, transaction_date, cleared_date)
values
  ('2523805b-2c19-4158-9c0c-0e2ada30b5cd', 'cd8bce8c-81af-4302-8019-113e352ed443',
   'e62e92f6-5029-4ce2-b28c-23c3db6dc50e', 40.00, 'cleared',
   'Debt payment · Dave ExtraCash (mirror of 9/25 arrears payment)', '2026-09-25', '2026-09-25');

commit;
