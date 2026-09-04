-- 2026-09-04 — Instacash (MoneyLion) reconciliation, closing out Issue #58.
-- Data-only, "Our Household". Run in the Supabase SQL Editor. No schema change.
-- Wrap in a transaction; review the verify script output before COMMIT.
--
-- Background: the 2026-09-04 cleo-instacash-untangle.sql migration unlinked the
-- 7/17 -$443.03 payment as a stray, leaving a ~$234.90 residual against the
-- stored $600.00 balance. Per user: MoneyLion actually shows a 6/20/2026 $620
-- advance (missing from the ledger entirely); both the 7/17 $443.03 and 7/20
-- $234.90 payments repaid it in full ($677.93 combined), with a ~$57.93
-- fee/tip bundled into those repayments (never counted toward the balance —
-- same as the Cleo Express Fee case earlier in the day). Exact split between
-- the two payments is unknown, so — per user — the full $57.93 is carved out
-- of the 7/17 charge alone: $385.10 real principal + $57.93 fee (still one
-- real $443.03 outflow, just two ledger rows, matching the Cleo precedent).
--
-- Reconciliation: advances 620 + 2,400 = 3,020.00; principal repayments
-- 385.10 + 234.90 + 600 + 600 + 600 = 2,420.00; 3,020.00 − 2,420.00 = 600.00,
-- matching the stored balance exactly.
--
-- IDs (Our Household cd8bce8c-81af-4302-8019-113e352ed443):
--   accounts    Venmo - Steven   9a1a0f9a-c966-4038-a108-36766faf83d3
--               Classic Checking 2e937b2d-471a-46f3-9a9d-cfc342a66414
--   institution MoneyLion        8c059a4c-23c8-42b5-92a4-3fe73e4b02b2
--   categories  Advances         07ad9463-3fa5-45ce-871a-d155bdeb00bd
--               Fees             be4f75e5-9ba0-4637-a790-ee9ce21bb83f
--   Instacash advance debt       e598a47c-5c39-46ad-b289-4127bd46683d

begin;

-- 1. The missing 6/20 $620 advance deposit, into Venmo - Steven.
insert into public.transactions
  (household_id, account_id, category_id, institution_id, amount, status,
   description, transaction_date, linked_debt_id)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443',
   '9a1a0f9a-c966-4038-a108-36766faf83d3',
   '07ad9463-3fa5-45ce-871a-d155bdeb00bd',
   '8c059a4c-23c8-42b5-92a4-3fe73e4b02b2',
   620.00, 'cleared', 'Advance: Instacash (MoneyLion)', '2026-06-20',
   'e598a47c-5c39-46ad-b289-4127bd46683d');

-- 2. Matching debt_adjustments row (ADR-056), so the debt's own history reads correctly.
insert into public.debt_adjustments
  (household_id, debt_id, amount, adjustment_type, description, adjustment_date, affects_balance)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443',
   'e598a47c-5c39-46ad-b289-4127bd46683d',
   620.00, 'advance', 'Advance: Instacash (MoneyLion)', '2026-06-20', true);

-- 3. Re-link the 7/17 payment and split out its bundled fee: was one -$443.03
--    charge, is now $385.10 real principal repayment + $57.93 fee (unlinked→
--    linked; the fee stays out of cycle/balance math via the "Fee:" prefix,
--    isFeeTransaction, same rule as the 8/14 Cleo Express Fee split).
update public.transactions
set amount = -385.10,
    linked_debt_id = 'e598a47c-5c39-46ad-b289-4127bd46683d'
where id = 'd48527f7-2ab7-4ce4-99d2-d55f962c1ad8';

insert into public.transactions
  (household_id, account_id, category_id, institution_id, amount, status,
   description, transaction_date, linked_debt_id)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443',
   '2e937b2d-471a-46f3-9a9d-cfc342a66414',
   'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   '8c059a4c-23c8-42b5-92a4-3fe73e4b02b2',
   -57.93, 'cleared', 'Fee: Instacash (MoneyLion) · advance repayment fee', '2026-07-17',
   'e598a47c-5c39-46ad-b289-4127bd46683d');

-- No change to public.debts — remaining_balance/minimum_payment (600.00/600.00,
-- set in the prior migration) already match this reconciliation.

commit;
