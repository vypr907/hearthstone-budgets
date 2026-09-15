-- 2026-09-15 — Cleo advance debt (085f2811): correct remaining_balance /
-- minimum_payment. Data-only, no schema change, no ADR (data correction,
-- not a new decision) -- same shape as
-- scripts/migrations/2026-09-11-dave-extracash-fix.sql /
-- 2026-09-14-earnin-cycle-fix.sql.
--
-- Superseded an earlier draft of this file that landed on $70.00 -- wrong,
-- corrected after the user caught it. The real target, confirmed with the
-- user directly: $110.00 (the two $55 advances, 9/4 + 9/5, both still
-- unpaid -- the older $40 cycle is fully settled and contributes $0).
--
-- THREE issues found, all confirmed with the user before writing this:
--
-- 1. A missing advance. A -$40 "Debt payment · Cleo" transaction dated
--    7/17 (backfilled into the app on 9/10) repays a Cleo advance that
--    predates ANY advance on record for this debt (the debt wasn't even
--    created until 8/13, first recorded advance 8/8) -- the books had no
--    matching draw for it. User confirmed: a real $40 advance on 2026-07-09
--    was simply never entered. Added here so the 7/17 repayment has
--    something real to repay, instead of wrongly subtracting $40 from the
--    *current* generation of advances.
--
-- 2. Balance race on the two $55 advances. debt_adjustments shows both
--    (9/4, 9/5) as real, distinct draws, but they were WRITTEN 16 seconds
--    apart on 9/6 -- a day before this session's ADR-101 atomic-RPC fix
--    existed (applied 9/11). Under the old racy pattern the second write
--    overwrote the first instead of adding, landing on $55 instead of
--    $110 from those two alone. Same bug class as Dave ExtraCash/EarnIn,
--    never individually repaired for Cleo until now.
--
-- 3. A $17.98 "Express Fee" double-entry. Recorded as BOTH a
--    balance-increasing debt_adjustment (+17.98, type 'other') AND a
--    separate balance-decreasing payment transaction (-17.98) -- user
--    confirmed both are real and should cancel out (net $0 balance
--    effect), and should properly be two separate $8.99 fees (one per
--    9/4 and 9/5 advance), paid via Venmo on 9/13 -- matching this debt's
--    own existing non-balance-affecting `Fee: Cleo · advance fee —
--    Express fee` convention already used for an earlier 8/14 $6.99 fee
--    (isFeeTransaction() keeps a "Fee:"-prefixed row out of balance/cycle
--    math entirely). Account confirmed: 9a1a0f9a… IS "Venmo - Steven",
--    the same account the 8/14 fee and all 3 advances used.
--
-- EVIDENCE / arithmetic (read-only MCP): advances 40 (7/9, added here) +
-- 40 (8/8) + 55 (9/4) + 55 (9/5) = 190; real repayments -40 (7/17) - 40
-- (8/14) = -80. Net = 110.00 -- matches the user's own figure exactly.
-- next_due_date (2026-09-10) confirmed correct by the user earlier, left
-- alone; cycle_paid_to_date/payment_status also untouched (already 0/unpaid).

begin;

-- Add the missing 7/9 advance (debt_adjustments row + its disbursement
-- transaction) so the 7/17 repayment has a real draw to repay.
insert into public.debt_adjustments
  (household_id, debt_id, amount, adjustment_type, description, adjustment_date, affects_balance)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '085f2811-f7b3-4491-a32e-869a747dfd4b',
   40.00, 'advance', 'Advance: Cleo', '2026-07-09', true);

insert into public.transactions
  (household_id, account_id, category_id, amount, status, description,
   transaction_date, cleared_date, linked_debt_id, institution_id, transfer_group_id)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3',
   null, 40.00, 'cleared', 'Advance: Cleo', '2026-07-09', '2026-07-09',
   '085f2811-f7b3-4491-a32e-869a747dfd4b', '32ddce8d-df53-4de5-aadc-7818079f10da',
   gen_random_uuid());

-- Remove the erroneous double-entered fee (balance-affecting adjustment +
-- its paired payment-style transaction).
delete from public.debt_adjustments
where id = '7ba202e9-ddbe-45f3-84e8-96f8b090cd2b';

delete from public.transactions
where id = 'fbb1dc2e-9dee-463e-ba4d-dc28fe4fe848';

-- Re-add as two non-balance-affecting fee transactions, one per advance,
-- dated 9/13 (when actually paid via Venmo) -- matching the account/
-- institution/category of the existing 8/14 $6.99 fee on this same debt.
insert into public.transactions
  (household_id, account_id, category_id, amount, status, description,
   transaction_date, cleared_date, linked_debt_id, institution_id)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3',
   'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', -8.99, 'cleared',
   'Fee: Cleo · advance fee — Express fee (9/4 advance)', '2026-09-13', '2026-09-13',
   '085f2811-f7b3-4491-a32e-869a747dfd4b', '32ddce8d-df53-4de5-aadc-7818079f10da'),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3',
   'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', -8.99, 'cleared',
   'Fee: Cleo · advance fee — Express fee (9/5 advance)', '2026-09-13', '2026-09-13',
   '085f2811-f7b3-4491-a32e-869a747dfd4b', '32ddce8d-df53-4de5-aadc-7818079f10da');

-- Correct the balance itself.
update public.debts set
  remaining_balance = 110.00,
  minimum_payment = 110.00
where id = '085f2811-f7b3-4491-a32e-869a747dfd4b';

commit;
