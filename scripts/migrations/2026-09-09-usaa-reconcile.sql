-- 2026-09-09 — Reconcile Classic Checking (USAA) + USAA Savings against
-- direct bank exports (planning/transactions_USAAnew.csv,
-- planning/transactions_USAAsavings.csv). Data-only. No schema change.
--
-- Built with scripts/reconcile-usaa-csv.mjs (79 CSV rows, 58 matched cleanly
-- against 82 already-logged transactions, 21 genuine discrepancies —
-- resolved below per the user interview; two false-negative merchant-regex
-- bugs found and fixed in the tool along the way, see its own comments).
--
-- Decisions from the interview:
-- 1. GCI's missing 8/20 ($385.52) and 9/8 ($64.51) payments are LEFT OUT —
--    GCI is a linked bill; the user will mark these paid in the app so
--    cycle_paid_to_date/next_due_date update correctly, rather than a raw
--    ledger insert that would desync the Bills screen.
-- 2. The 6x $100 "MoneyLion" CSV lines on 8/28 are the same one $600
--    advance already logged (ea1fa333...) — USAA's statement just itemizes
--    the payout in $100 chunks. Excluded — nothing to add.
-- 3. The 8/13 paycheck was logged as $1,810.00; every other paycheck in the
--    CSV (and this one) is exactly $1,809.38 — corrected below.
-- 4. The 7/16-7/17 "USAA Funds Transfer"/"OD Advance Transfer" cluster
--    turned out to be real transfers between Classic Checking and USAA
--    Savings (confirmed once the user supplied the savings CSV mid-review):
--    $500 Checking->Savings and $105 Savings->Checking on 7/16, $254.60
--    Savings->Checking (overdraft protection) on 7/17. Logged as real
--    ADR-056 transfer pairs (title auto-renders "Source -> Destination"
--    per ADR-098 — descriptions deliberately left null).
-- 5. Everything else genuinely missing: a first-ever paycheck for this
--    account (7/16), 4 previously-untracked Tilt cash-advance charges
--    (household has no Tilt debt — logged as plain fee-categorized
--    transactions, matching how OD fees are handled), one untracked
--    Brewster's Restaurant charge, the 8/13 OD-fee-window-refund/fee pair
--    (nets to $0, logged anyway per the user), and one untracked USAA P&C
--    Insurance payment from Savings.

begin;

-- Correct the 8/13 paycheck amount ($1,810.00 -> $1,809.38).
update public.transactions set amount = 1809.38
  where id = 'e3a25197-6b5f-46f7-a70d-24daa6eb92a8';

-- Classic Checking (2e937b2d-...) additions.
-- cleared_date = transaction_date throughout (ADR-100): every row here is
-- written directly as cleared with one real date, not a pending->cleared
-- transition.
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, description, transaction_date, cleared_date)
values
  ('30bec797-5ed0-4f0b-ad74-ba82208eca5c', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', -105.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '480d00f9-44ff-41b7-8036-97de8dea4acb', 'Tilt Advance', '2026-07-16', '2026-07-16'),
  ('cf5b602c-3b91-44d8-acec-c3382dd20f63', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', -8.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '480d00f9-44ff-41b7-8036-97de8dea4acb', 'Tilt Finance', '2026-07-16', '2026-07-16'),
  ('4be073c6-a951-4fae-85ce-6215e3ee2742', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', -8.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '480d00f9-44ff-41b7-8036-97de8dea4acb', 'Tilt Finance', '2026-07-30', '2026-07-30'),
  ('6f987c5b-bcf8-41fd-b3e6-589ec0b3e168', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', -8.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '480d00f9-44ff-41b7-8036-97de8dea4acb', 'Tilt Finance', '2026-08-20', '2026-08-20'),
  ('46660716-4616-460a-8a0a-28feb477ab67', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', 1809.38, 'cleared', null, '850f28b0-d705-47cf-aeb6-b2db115389e7', 'Paycheck: ASRC Federal', '2026-07-16', '2026-07-16'),
  ('24c87ccc-b06d-4018-9cb3-5005a6ba45ff', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', -39.58, 'cleared', null, '0dec2ead-f20e-4eb3-b959-d40e086ff7dd', null, '2026-08-19', '2026-08-19'),
  ('71079108-0868-49e5-abfb-20682dd207f3', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', 29.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '4893aa05-e6bd-4c45-afba-5dc74c1943af', 'OD Fee Window Refund', '2026-08-13', '2026-08-13'),
  ('d59f0929-a315-4dfa-acf8-5c4fce793252', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', -29.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '4893aa05-e6bd-4c45-afba-5dc74c1943af', 'OD Fee', '2026-08-13', '2026-08-13');

-- USAA Savings (7793c44f-...) addition.
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, description, transaction_date, cleared_date)
values
  ('04aa9211-3cd5-458b-a9d9-50fdb7c01726', 'cd8bce8c-81af-4302-8019-113e352ed443', '7793c44f-4d9a-456a-9bc4-2edeafbfa68a', -60.00, 'cleared', null, '4893aa05-e6bd-4c45-afba-5dc74c1943af', 'USAA Property and Casualty Insurance', '2026-07-17', '2026-07-17');

-- Transfer 1: $500 Classic Checking -> USAA Savings, 7/16.
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, transaction_date, cleared_date)
values
  ('968f6652-c37f-4a4a-a340-b8841b6c12cb', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', -500.00, 'cleared', '890da138-3fef-4ae4-a36c-8bd0f6677132', '2026-07-16', '2026-07-16'),
  ('2de9b473-1381-4a41-a0d7-d031b4414d76', 'cd8bce8c-81af-4302-8019-113e352ed443', '7793c44f-4d9a-456a-9bc4-2edeafbfa68a', 500.00, 'cleared', '890da138-3fef-4ae4-a36c-8bd0f6677132', '2026-07-16', '2026-07-16');

-- Transfer 2: $105 USAA Savings -> Classic Checking, 7/16.
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, transaction_date, cleared_date)
values
  ('5e4cb4c9-70b5-4d0b-a941-60609c1beb23', 'cd8bce8c-81af-4302-8019-113e352ed443', '7793c44f-4d9a-456a-9bc4-2edeafbfa68a', -105.00, 'cleared', 'c05dc819-4602-4801-9368-7c1f837a9dcf', '2026-07-16', '2026-07-16'),
  ('a004f54a-3bb3-4088-9cd0-5373be86e93b', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', 105.00, 'cleared', 'c05dc819-4602-4801-9368-7c1f837a9dcf', '2026-07-16', '2026-07-16');

-- Transfer 3: $254.60 USAA Savings -> Classic Checking (overdraft protection pull), 7/17.
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, transaction_date, cleared_date)
values
  ('b31c2105-f77c-4679-b1c1-6afb20466d7f', 'cd8bce8c-81af-4302-8019-113e352ed443', '7793c44f-4d9a-456a-9bc4-2edeafbfa68a', -254.60, 'cleared', '1a53120b-8c5e-4215-8682-5d5c424239a7', '2026-07-17', '2026-07-17'),
  ('1920eb74-1ea1-44f5-8e82-d0efe844cd5c', 'cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', 254.60, 'cleared', '1a53120b-8c5e-4215-8682-5d5c424239a7', '2026-07-17', '2026-07-17');

commit;
