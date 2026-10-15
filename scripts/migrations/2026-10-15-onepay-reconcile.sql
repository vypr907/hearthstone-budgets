-- 2026-10-15 — OnePay Advance: reconcile to the real history, confirmed
-- with the user (ADR-111 addendum).
--
-- Interviewed the user against the full chronological ledger. Every real
-- cycle is $225 advance + $6.75 "advance overdraft fee," fully repaid
-- before the next draw. Three concrete gaps, now closed:
--
-- 1. The 2026-07-02 $225 draw was a real advance but was never logged as
--    a debt_adjustments marker (only its disbursement transaction
--    exists) — added here so it's a normal episode instead of an
--    ambiguous "pre-tracking orphan."
-- 2. The 2026-08-11 and 2026-08-27 repayments ($231.75 each) DO exist in
--    the ledger, but both were entered as two "Fee: OnePay Advance"
--    lines with no linked_debt_id at all — the $225 "principal" half of
--    each was invisible to the debt's own tracking (wrong description,
--    untagged). The $6.75 fee half of each is correctly a ledger-only
--    "Fee: " line (ADR-084) and is left untouched. Retagged the $225
--    halves: linked_debt_id set, description corrected to match every
--    other real repayment ("Debt payment · OnePay Advance").
-- 3. The still-open 2026-09-11 draw ($225) never got its own $6.75 fee
--    logged (confirmed with the user it's real, even though the cycle
--    itself is still open) — added as a debt_adjustments row, matching
--    the one earlier cycle (2026-08-14) that already used this
--    convention.
--
-- Reconstructing the full corrected ledger (via the newly-fixed
-- computeAdvanceEpisodes, which also needed its own carry-forward fix —
-- see the ADR-111 2026-10-15 addendum in docs/DECISIONS.md) lands on
-- exactly $231.75 owed for the still-open cycle (the $225 draw + $6.75
-- fee, nothing repaid yet) — every earlier cycle nets to $0. Corrects
-- the stored remaining_balance/minimum_payment to match; cycle_paid_to_date/
-- payment_status reset to the "freshly opened, nothing paid yet" state;
-- next_due_date set to 2026-10-08, the cycle's own real due date per the
-- user (the stale 2026-09-21 value predates this draw and would
-- otherwise trip a false "past due" once the balance is nonzero again).
--
-- Our Household (cd8bce8c-81af-4302-8019-113e352ed443):
--   debt      OnePay Advance   a1581069-a274-4ef5-91a5-690943fed672
--   account   One Checking - Steven   40124cdf-70bf-4923-8f1e-a7395a85e902

begin;

insert into public.debt_adjustments
  (id, household_id, debt_id, amount, adjustment_type, description, adjustment_date, affects_balance)
values
  ('7f6a8559-e65c-45aa-a152-375688225e44', 'cd8bce8c-81af-4302-8019-113e352ed443',
   'a1581069-a274-4ef5-91a5-690943fed672', 225.00, 'advance', 'Advance: OnePay Advance', '2026-07-02', true),
  ('a763bc3a-a98d-4ad3-8fe3-81604540abac', 'cd8bce8c-81af-4302-8019-113e352ed443',
   'a1581069-a274-4ef5-91a5-690943fed672', 6.75, 'other', 'Advance Overdraft Fee', '2026-09-11', true);

update public.transactions
set linked_debt_id = 'a1581069-a274-4ef5-91a5-690943fed672',
    description = 'Debt payment · OnePay Advance'
where id in (
  '3a8d7ef3-e289-4c76-b217-19a70708f562',  -- 8/11 payment, was untagged "Fee: OnePay Advance"
  '288cafd8-8e8a-474c-abbf-dd4b9f0c28a6'   -- 8/27 payment, same mislabeling
);

update public.debts
set
  remaining_balance = 231.75,
  minimum_payment = 231.75,
  cycle_paid_to_date = 0.00,
  payment_status = 'unpaid',
  next_due_date = '2026-10-08'
where id = 'a1581069-a274-4ef5-91a5-690943fed672';

commit;
