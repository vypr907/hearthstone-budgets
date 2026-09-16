-- 2026-09-16 — CreditOne & Mission Lane: reconcile account/debt against
-- real statements (docs/planning/CreditOne1.pdf [Jun 26-Jul 25 close],
-- CreditOne2.pdf [Jul 26-Aug 25 close], CreditOne3.pdf [May 26-Jun 25
-- close, the EARLIEST despite its number], statement_missionLane_JUL/
-- AUG/SEP.pdf [closing 07/02, 08/02, 09/02]). Data-only, no schema
-- change, no new ADR — same pattern as
-- 2026-09-16-milestone-statement-reconciliation.sql, for the other two
-- credit-card debts the 9/15 linking migration flagged as provisional.
--
-- Both accounts had the exact same stray-snapshot problem as Milestone: a
-- account_balances row logged 2026-07-28 (the day the debts were first
-- entered, before either was linked to its account) was silently
-- overriding starting_balance as the anchor. Both deleted below.
--
-- Bug found + fixed: Mission Lane's 2 existing "Credit Protect Fee"
-- transactions (751fac58/b5c9bc81) carry linked_debt_id but their
-- description doesn't start with "Fee:" -- the naming convention
-- isFeeTransaction()/ADR-046 relies on to exclude fee rows from
-- payment-cycle math. This is almost certainly why the debt's stored
-- cycle_paid_to_date was $46.12 -- exactly the sum of those two fees, as
-- if they'd been paid toward the minimum. Clearing linked_debt_id on both
-- (matching every other fee/purchase here, all plain account
-- transactions with no linked_debt_id) rather than renaming them.
--
-- Real payments already in the ledger (linked_debt_id-tagged, on the
-- FUNDING accounts) but never mirrored onto their card's own account,
-- since all four predate their debt being linked to an account:
--   CreditOne:    4bc732df-... 2026-07-20 -$30.00 (One Checking) --
--     matches CreditOne1's 07/20 INTERNET PAYMENT $30.00.
--   CreditOne:    801707e4-... 2026-08-31 -$60.00 (One Checking) -- made
--     AFTER CreditOne2's Aug 25 close, not on any statement.
--   Mission Lane: 97cf62cc-... 2026-07-17 -$250.00 -- matches the Aug
--     statement's 07/16 PAYMENT $250.00.
--   Mission Lane: c725e180-... 2026-08-28 -$121.68 -- matches the Sept
--     statement's 08/27 PAYMENT $121.68.
-- All four get a proper mirror leg + shared transfer_group_id, the same
-- shape useMarkSubmitted/useMarkCleared produce (src/lib/payments.ts).
--
-- Two Mission Lane payments bounced (posted, then reversed days later
-- with a $41 Returned Payment Fee): $102.93 (6/27->7/1) and $50.00
-- (7/27->7/30). Neither was ever recorded in the app. Per the user: the
-- wash pair (payment + reversal, net zero) is skipped entirely; only the
-- real $41 fee each time is recorded.
--
-- Two Mission Lane purchases are linked to their existing bills per the
-- user: GOOGLE *SOLO YOUR GIG ($18.99) -> bill "Solo", category Side Gig;
-- GOOGLE *Google One ($10.54) -> bill "Google One", category Software &
-- Tech.
--
-- CreditOne anchor: starting_balance = -299.14 (CreditOne3's own
-- "Previous Balance", the balance before any transaction below).
--   -299.14  -3.23  -30.00  -7.53                    -> -339.90  = CreditOne3 close ($339.90)
--   +34.95  +0.02  +0.33  -4.95  +30.00  -2.76  -7.56 -> -289.87  = CreditOne1 close ($289.87)
--   -3.22  -8.25  -30.00  -7.29                       -> -338.63  = CreditOne2 close ($338.63)
--   +60.00                                             -> -278.63  = current true balance
--
-- Mission Lane anchor: starting_balance = -1709.55 (July statement's own
-- "Previous Balance"). The 2 pre-existing fee rows are counted in place,
-- not re-inserted.
--   -1709.55  +100.00  +0.28  -18.99  -41.00  -25.48  -41.07           -> -1735.81  = July close ($1,735.81)
--   +250.00  +0.16  -10.54  -41.00  -23.50(existing)  -40.18           -> -1600.87  = Aug close ($1,600.87)
--   +121.68  -22.62(existing)  -39.55                                   -> -1541.36  = Sept close ($1,541.36) = current
--
-- debts.remaining_balance is derived/display-only for a linked debt
-- (ADR-102 addendum) but the raw column is still the baseline several
-- mutations read before writing back (Issue #67), so both are kept in
-- sync here too, along with minimum_payment/next_due_date (both stale --
-- set from each debt's latest known statement: CreditOne2 for CreditOne,
-- the Sept statement for Mission Lane).
--
-- payment_status / cycle_paid_to_date / opening_arrears / arrears_as_of /
-- arrears_paid_to_date deliberately NOT touched -- src/routes/app.debts.tsx
-- has a built-in "Sync stored status" button (useSyncStoredStatus,
-- src/lib/payments.ts) that reconciles payment_status/cycle_paid_to_date
-- from the ledger once this runs; tap it on each debt's detail dialog
-- afterward if it appears.

begin;

-- Remove both stale pre-linking snapshots that were overriding the anchor.
delete from public.account_balances where id in (
  '0d5d3bad-8e21-417f-9bf0-9b522a22edb8', -- CreditOne, $309.55 2026-07-09
  '286c5078-c061-4a70-a142-9af279789934'  -- Mission Lane, $1,485.81 2026-07-24
);

-- Fix: these 2 existing fee rows shouldn't have been linked_debt_id-tagged
-- (a fee is a plain account transaction, same as every purchase here) --
-- root cause of the stale $46.12 cycle_paid_to_date.
update public.transactions set linked_debt_id = null
  where id in ('751fac58-1bbd-4c2c-b0aa-5739f4639fdd', 'b5c9bc81-1546-4016-8608-79e7e39ec14c');

-- Link the 4 pre-existing real payments to their new account mirrors below.
update public.transactions set transfer_group_id = 'b3f7d2c0-0000-4000-8000-000000000001'
  where id = '4bc732df-ad94-42eb-bcb2-0e2d5deab91d'; -- CreditOne 07/20
update public.transactions set transfer_group_id = 'b3f7d2c0-0000-4000-8000-000000000002'
  where id = '801707e4-5235-4d44-a96b-d8a231b60868'; -- CreditOne 08/31
update public.transactions set transfer_group_id = 'b3f7d2c0-0000-4000-8000-000000000003'
  where id = '97cf62cc-06ae-44fa-baae-19458568e87b'; -- Mission Lane 07/17
update public.transactions set transfer_group_id = 'b3f7d2c0-0000-4000-8000-000000000004'
  where id = 'c725e180-34d2-4834-8906-d1066f25d03f'; -- Mission Lane 08/28

-- CreditOne statement-sourced transactions.
insert into public.transactions
  (household_id, account_id, institution_id, category_id, amount, status,
   description, transaction_date, cleared_date, transfer_group_id, linked_bill_id)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -3.23, 'cleared', 'Credit Protect', '2026-06-25', '2026-06-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -30.00, 'cleared', 'Late Fee', '2026-06-25', '2026-06-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', '69d59b2b-0d2e-4bd0-84b7-67f2792120c8',
   -7.53, 'cleared', 'Interest Charge on Purchases', '2026-06-25', '2026-06-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', null,
   34.95, 'cleared', 'Payment - Debit Card', '2026-06-25', '2026-06-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', '1d4141ec-ccd9-4d9d-8760-9d01f4df7525',
   0.02, 'cleared', '*Finance Charge* Prev Cycle Purchases', '2026-06-25', '2026-06-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', '1d4141ec-ccd9-4d9d-8760-9d01f4df7525',
   0.33, 'cleared', 'Credit Protection Adj', '2026-06-25', '2026-06-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -4.95, 'cleared', 'Express Payment Fee', '2026-06-26', '2026-06-26', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', null,
   30.00, 'cleared', 'Debt payment · CreditOne', '2026-07-20', '2026-07-20',
   'b3f7d2c0-0000-4000-8000-000000000001', null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -2.76, 'cleared', 'Credit Protect', '2026-07-25', '2026-07-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', '69d59b2b-0d2e-4bd0-84b7-67f2792120c8',
   -7.56, 'cleared', 'Interest Charge on Purchases', '2026-07-25', '2026-07-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -3.22, 'cleared', 'Credit Protect', '2026-08-25', '2026-08-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -8.25, 'cleared', 'Annual Fee', '2026-08-25', '2026-08-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -30.00, 'cleared', 'Late Fee', '2026-08-25', '2026-08-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', '69d59b2b-0d2e-4bd0-84b7-67f2792120c8',
   -7.29, 'cleared', 'Interest Charge on Purchases', '2026-08-25', '2026-08-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
   'bca8e25c-26dd-4a8f-a69e-e2037748e053', null,
   60.00, 'cleared', 'Debt payment · CreditOne', '2026-08-31', '2026-08-31',
   'b3f7d2c0-0000-4000-8000-000000000002', null);

-- Mission Lane statement-sourced transactions.
insert into public.transactions
  (household_id, account_id, institution_id, category_id, amount, status,
   description, transaction_date, cleared_date, transfer_group_id, linked_bill_id)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', null,
   100.00, 'cleared', 'PAYMENT - THANK YOU', '2026-06-25', '2026-06-25', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', 'e45dbf98-5f1e-4204-8b96-1b499a368e5b',
   0.28, 'cleared', 'Cash Back Credit', '2026-07-01', '2026-07-01', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', 'b492f570-2cff-4160-a442-c77bf19aa419',
   -18.99, 'cleared', 'GOOGLE *SOLO YOUR GIG', '2026-06-29', '2026-06-29', null,
   'bd30f296-f463-48ef-a2b6-7a28157f02da'),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -41.00, 'cleared', 'Returned Payment Fee', '2026-07-01', '2026-07-01', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -25.48, 'cleared', 'Credit Protect Fee', '2026-07-02', '2026-07-02', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', '69d59b2b-0d2e-4bd0-84b7-67f2792120c8',
   -41.07, 'cleared', 'Interest Charge - Purchases', '2026-07-02', '2026-07-02', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', null,
   250.00, 'cleared', 'Debt payment · Mission Lane', '2026-07-17', '2026-07-17',
   'b3f7d2c0-0000-4000-8000-000000000003', null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', 'e45dbf98-5f1e-4204-8b96-1b499a368e5b',
   0.16, 'cleared', 'Cash Back Credit', '2026-08-01', '2026-08-01', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', '5aefc3f2-664b-4fb7-815d-d656175ddb5d',
   -10.54, 'cleared', 'GOOGLE *Google One', '2026-07-29', '2026-07-29', null,
   'f8d923f7-f171-4ee3-b108-856936bbf2c2'),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   -41.00, 'cleared', 'Returned Payment Fee', '2026-07-30', '2026-07-30', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', '69d59b2b-0d2e-4bd0-84b7-67f2792120c8',
   -40.18, 'cleared', 'Interest Charge - Purchases', '2026-08-02', '2026-08-02', null, null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', null,
   121.68, 'cleared', 'Debt payment · Mission Lane', '2026-08-28', '2026-08-28',
   'b3f7d2c0-0000-4000-8000-000000000004', null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '2875d7b3-630b-4a14-82f1-3241db3c225e',
   'c2b1f161-e9f8-4099-accf-7c6f7e17b0df', '69d59b2b-0d2e-4bd0-84b7-67f2792120c8',
   -39.55, 'cleared', 'Interest Charge - Purchases', '2026-09-02', '2026-09-02', null, null);

update public.accounts set starting_balance = -299.14
  where id = 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f'; -- CreditOne
update public.accounts set starting_balance = -1709.55
  where id = '2875d7b3-630b-4a14-82f1-3241db3c225e'; -- Mission Lane

update public.debts set
  remaining_balance = 278.63,
  minimum_payment = 90.00,
  next_due_date = '2026-09-21'
  where id = '31a11f8f-36c5-4d5d-9246-27ae60f669a5'; -- CreditOne

update public.debts set
  remaining_balance = 1541.36,
  minimum_payment = 78.17,
  next_due_date = '2026-09-27'
  where id = '3cc9ddca-9aa8-4f65-804a-7ec95836a9f7'; -- Mission Lane

commit;
