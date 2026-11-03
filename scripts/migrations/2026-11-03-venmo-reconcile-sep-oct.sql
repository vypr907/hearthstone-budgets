-- 2026-11-03 — Venmo statement reconciliation (Sep 9 - Oct 31 2026), Our Household.
-- Data-only. Run in the Supabase SQL Editor. No schema change.
--
-- Source: Venmo's own September + October 2026 monthly statement CSVs
-- (planning/*.csv, gitignored) compared against the "Venmo - Steven" account's
-- 437 logged transactions via scripts/reconcile-venmo-csv.mjs (institution map
-- extended, filename filter added to skip non-Venmo CSVs also sitting in
-- planning/). 139 of 144 CSV-flagged-missing rows are included below; 5 are
-- deliberately skipped (see note near the end). 3 additional Cleo advance
-- draws not flagged by the CSV diff at all (confirmed directly with the user
-- against Venmo's own transaction list) are also included.
--
-- Explicitly OUT of scope (per user decision, same posture as the 2026-09-08
-- pass): the Rent (via Flex) bill's cycle is still behind after these 2
-- payments land (next_due_date stuck at 2026-09-01) — a bigger catch-up than
-- this Venmo pass covers, left for a separate session.
--
-- Categorization: picked per-institution from the MODE of that institution's
-- own existing category_id on past transactions (queried live via the
-- read-only MCP), not guessed — e.g. Fred Meyers/Circle K -> Auto & Transport
-- (0f63e7bb, gas-dominant in this household's history), Safeway/Starbucks/
-- Walmart -> Groceries (1b2f4ecc), most restaurants -> Dining (55e48250),
-- subscriptions/games/venues -> Entertainment (537a29d6).
--
-- IDs (Our Household cd8bce8c-81af-4302-8019-113e352ed443):
--   account     Venmo - Steven           9a1a0f9a-c966-4038-a108-36766faf83d3
--   institution Venmo                    edf5c0ca-f45b-4709-b159-053977f32903
--   debt        Cleo                     085f2811-f7b3-4491-a32e-869a747dfd4b
--   bill        Rent (via Flex)          e51d00e3-ad6e-41c5-9ad4-4e12eb204191
--   category    Fees                     be4f75e5-9ba0-4637-a790-ee9ce21bb83f
--
-- Transfer destinations confirmed by the user:
--   Visa *6002  -> vypr907 Cash App checking   64b5d727-f7b7-450e-aabc-6011c1088423
--   Visa *1661  -> Classic Checking (USAA)     2e937b2d-471a-46f3-9a9d-cfc342a66414
--   OnePay *0801 -> One Checking - Steven      40124cdf-70bf-4923-8f1e-a7395a85e902
--   CASH APP*STEVEN LASZLO -> laszloffy Cash App checking  7a6e9dd0-74a8-4014-8b0b-59c5a004229e
--
-- 10 new institutions, confirmed with the user (verified none already
-- existed under these names first, via the read-only MCP):
--   TURO, PAI ATM, Netflix, Panda Express, The Basement, Yes! Noodle Soup,
--   Uber, 9 Lives Auto, Fruit Juice Game, Laundry Rush Game.
-- Rosebud Marketing and FBX MOBIL stay institution-less, matching the
-- household's existing (already-logged) rows for both.

begin;

insert into public.institutions (id, household_id, name, institution_type) values
  ('497e3f9a-7676-44e0-b109-7cc5dc3b0158', 'cd8bce8c-81af-4302-8019-113e352ed443', 'TURO', 'other');
insert into public.institutions (id, household_id, name, institution_type) values
  ('c8205f75-7c4f-4ded-a4bd-e2dc2be2c48d', 'cd8bce8c-81af-4302-8019-113e352ed443', 'PAI ATM', 'other');
insert into public.institutions (id, household_id, name, institution_type) values
  ('3d5214ec-5d9c-4550-aa5c-ab954fb61a1c', 'cd8bce8c-81af-4302-8019-113e352ed443', 'Netflix', 'subscription');
insert into public.institutions (id, household_id, name, institution_type) values
  ('6763922d-4dec-4965-83cf-5ab402c0b312', 'cd8bce8c-81af-4302-8019-113e352ed443', 'Panda Express', 'restaurant');
insert into public.institutions (id, household_id, name, institution_type) values
  ('d72ffff2-219a-411b-9fb3-180259ba277f', 'cd8bce8c-81af-4302-8019-113e352ed443', 'The Basement', 'venue');
insert into public.institutions (id, household_id, name, institution_type) values
  ('cc8fd269-85ba-42e7-b5e3-436c663341f5', 'cd8bce8c-81af-4302-8019-113e352ed443', 'Yes! Noodle Soup', 'restaurant');
insert into public.institutions (id, household_id, name, institution_type) values
  ('07a0809f-0297-4ffe-b5e8-fa47f833753a', 'cd8bce8c-81af-4302-8019-113e352ed443', 'Uber', 'other');
insert into public.institutions (id, household_id, name, institution_type) values
  ('346fe1d7-584c-48d4-8653-6e743b276e44', 'cd8bce8c-81af-4302-8019-113e352ed443', '9 Lives Auto', 'other');
insert into public.institutions (id, household_id, name, institution_type) values
  ('892d463c-4194-495e-bfc8-b018be0c5518', 'cd8bce8c-81af-4302-8019-113e352ed443', 'Fruit Juice Game', 'game');
insert into public.institutions (id, household_id, name, institution_type) values
  ('96603bae-e230-49c9-ac5f-3328af700fcc', 'cd8bce8c-81af-4302-8019-113e352ed443', 'Laundry Rush Game', 'game');

-- SKIPPED: 2026-09-09  $0.00  Uber (zero-amount, no economic effect, cause unknown)

-- 2026-09-19  -34.24  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -34.24, 'cleared', 'FRED MEYER #0224', '2026-09-19');

-- 2026-09-20  -23.00  Rosebud Marketing
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -23.00, 'cleared', 'Rosebud Marketing', '2026-09-20');

-- 2026-09-20  -21.04  WAL-MART #2722
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', '85e88a17-bd0a-4a5f-8967-0c86cfa39c7c', -21.04, 'cleared', 'WAL-MART #2722', '2026-09-20');

-- 2026-09-21  -27.13  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -27.13, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-09-21');

-- 2026-10-01  -45.20  DoorDash
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '63047dee-3cad-429d-92ed-7067569f41f5', -45.20, 'cleared', 'DoorDash', '2026-10-01');

-- 2026-10-02  -20.00  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -20.00, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-02');

-- 2026-10-02  -44.24  THAI CUISINE RESTAURAN
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'a6138d14-c3cd-4ab0-8655-50f02685c284', -44.24, 'cleared', 'THAI CUISINE RESTAURAN', '2026-10-02');

-- 2026-10-02  -20.60  PAGODA CHINESE RESTAUR
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '0fa500c7-1ecf-4004-be3c-abd2b0afd5d9', -20.60, 'cleared', 'PAGODA CHINESE RESTAUR', '2026-10-02');

-- 2026-10-03  -16.00  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -16.00, 'cleared', 'Sunrise Bagel & Espres', '2026-10-03');

-- 2026-10-03  -45.00  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -45.00, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-03');

-- 2026-10-03  -9.23  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -9.23, 'cleared', 'McDonald''s Corporation', '2026-10-03');

-- 2026-10-03  -17.90  CIRCLEK#2746622 2300 S
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -17.90, 'cleared', 'CIRCLEK#2746622 2300 S', '2026-10-03');

-- 2026-10-04  -25.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -25.50, 'cleared', 'Sunrise Bagel & Espres', '2026-10-04');

-- 2026-10-04  -36.72  SALLY BEAUTY 10228
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'd481456f-e4eb-4a1d-b187-984204d75141', '2ad8afea-c5ec-4092-95f0-5f18f1a66cf8', -36.72, 'cleared', 'SALLY BEAUTY 10228', '2026-10-04');

-- 2026-10-04  -54.90  GALLO'S MEXICAN RESTAU
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'f5c554ce-2c3d-42a8-b5b0-f493291956a6', -54.90, 'cleared', 'GALLO''S MEXICAN RESTAU', '2026-10-04');

-- 2026-10-05  -30.00  STARBUCKS
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'ba9a8635-762a-43de-86ee-5b33775bb5d9', -30.00, 'cleared', 'STARBUCKS', '2026-10-05');

-- 2026-10-05  -23.00  FBX MOBIL 2--K426246
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -23.00, 'cleared', 'FBX MOBIL 2--K426246', '2026-10-05');

-- 2026-10-05  -43.39  BAMBOO PANDA FAMILY RE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '6ee0a791-23ee-4323-8be1-e092671a25c9', -43.39, 'cleared', 'BAMBOO PANDA FAMILY RE', '2026-10-05');

-- 2026-10-05  -69.76  LW GENERAL STORE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -69.76, 'cleared', 'LW GENERAL STORE', '2026-10-05');

-- 2026-10-06  -16.00  SUNRISE BAGEL & ESPRES
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -16.00, 'cleared', 'SUNRISE BAGEL & ESPRES', '2026-10-06');

-- 2026-10-06  -10.54  Google Finch Self Car
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '1fc5cbdc-d676-4456-bfe8-0afb348c9fc6', -10.54, 'cleared', 'Google Finch Self Car', '2026-10-06');

-- 2026-10-06  -17.50  SQ *LITTLE OWL CAFE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'f007916f-3bd7-488a-808a-a078be3fbd27', -17.50, 'cleared', 'SQ *LITTLE OWL CAFE', '2026-10-06');

-- 2026-10-06  -60.00  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -60.00, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-06');

-- 2026-10-06  -5.26  Google Fruit Juice Fa
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', '892d463c-4194-495e-bfc8-b018be0c5518', -5.26, 'cleared', 'Google Fruit Juice Fa', '2026-10-06');

-- 2026-10-06  -29.80  PANDA EXPRESS #3622
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '6763922d-4dec-4965-83cf-5ab402c0b312', -29.80, 'cleared', 'PANDA EXPRESS #3622', '2026-10-06');

-- 2026-10-06  -5.26  Google Laundry Rush I
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', '96603bae-e230-49c9-ac5f-3328af700fcc', -5.26, 'cleared', 'Google Laundry Rush I', '2026-10-06');

-- 2026-10-07  -23.50  SQ *LITTLE OWL CAFE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'f007916f-3bd7-488a-808a-a078be3fbd27', -23.50, 'cleared', 'SQ *LITTLE OWL CAFE', '2026-10-07');

-- 2026-10-07  -30.98  BARNES & NOBLE #2235
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', '95f86315-b27c-4461-bd84-c39eade6b464', -30.98, 'cleared', 'BARNES & NOBLE #2235', '2026-10-07');

-- 2026-10-07  -46.74  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -46.74, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-07');

-- 2026-10-08  -16.00  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -16.00, 'cleared', 'Sunrise Bagel & Espres', '2026-10-08');

-- 2026-10-08  -23.99  PETCO 1147 -n24
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '8d2d98a2-bc3b-48bd-af33-4582c67aa042', 'b733b2dd-208d-4b81-a541-4a6b9d060faf', -23.99, 'cleared', 'PETCO 1147 -n24', '2026-10-08');

-- 2026-10-08  -81.94  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -81.94, 'cleared', 'FRED MEYER #0224', '2026-10-08');

-- 2026-10-09  -97.93  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -97.93, 'cleared', 'FRED MEYER #0224', '2026-10-09');

-- 2026-10-09  -79.00  SQ *THUMBS UP BY GNAP
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'f78e2e1d-f9fa-4f2b-a51e-475c10736ba7', -79.00, 'cleared', 'SQ *THUMBS UP BY GNAP', '2026-10-09');

-- 2026-10-09  -16.49  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -16.49, 'cleared', 'LW GENERAL STORE BADGE', '2026-10-09');

-- 2026-10-10  -48.74  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -48.74, 'cleared', 'FRED MEYER #0224', '2026-10-10');

-- 2026-10-10  -14.25  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -14.25, 'cleared', 'Sunrise Bagel & Espres', '2026-10-10');

-- 2026-10-11  -16.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -16.50, 'cleared', 'Sunrise Bagel & Espres', '2026-10-11');

-- 2026-10-11  -90.00  SQ *VAPE GIFT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'ba75812a-bb5b-4ab2-b5c5-984c76345e51', '52d0e913-6413-472e-8a5a-0aadb2a43c5d', -90.00, 'cleared', 'SQ *VAPE GIFT', '2026-10-11');

-- 2026-10-11  -42.00  SQ *THE BASEMENT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', 'd72ffff2-219a-411b-9fb3-180259ba277f', -42.00, 'cleared', 'SQ *THE BASEMENT', '2026-10-11');

-- 2026-10-11  -20.00  SQ *THE BASEMENT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', 'd72ffff2-219a-411b-9fb3-180259ba277f', -20.00, 'cleared', 'SQ *THE BASEMENT', '2026-10-11');

-- 2026-10-11  -10.00  SQ *THE BASEMENT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', 'd72ffff2-219a-411b-9fb3-180259ba277f', -10.00, 'cleared', 'SQ *THE BASEMENT', '2026-10-11');

-- 2026-10-11  -12.00  SQ *THE BASEMENT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', 'd72ffff2-219a-411b-9fb3-180259ba277f', -12.00, 'cleared', 'SQ *THE BASEMENT', '2026-10-11');

-- 2026-10-13  -20.00  ANTHROPIC* CLAUDE SUB
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '5aefc3f2-664b-4fb7-815d-d656175ddb5d', '394f7585-05fe-4d76-9897-06e7f387042a', -20.00, 'cleared', 'ANTHROPIC* CLAUDE SUB', '2026-10-13');

-- 2026-10-14  -9.99  Uber
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', '07a0809f-0297-4ffe-b5e8-fa47f833753a', -9.99, 'cleared', 'Uber', '2026-10-14');

-- 2026-10-14  -8.25  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -8.25, 'cleared', 'Sunrise Bagel & Espres', '2026-10-14');

-- 2026-10-14  -13.25  SQ *LITTLE OWL CAFE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'f007916f-3bd7-488a-808a-a078be3fbd27', -13.25, 'cleared', 'SQ *LITTLE OWL CAFE', '2026-10-14');

-- 2026-10-15  -30.00  FRED M FUEL #9224   Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224   Q7', '2026-10-15');

-- 2026-10-15  -13.00  SQ *LITTLE OWL CAFE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'f007916f-3bd7-488a-808a-a078be3fbd27', -13.00, 'cleared', 'SQ *LITTLE OWL CAFE', '2026-10-15');

-- 2026-10-15  -16.00  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -16.00, 'cleared', 'Sunrise Bagel & Espres', '2026-10-15');

-- 2026-10-15  -16.49  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -16.49, 'cleared', 'LW GENERAL STORE BADGE', '2026-10-15');

-- 2026-10-16  -23.00  Rosebud Marketing
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -23.00, 'cleared', 'Rosebud Marketing', '2026-10-16');

-- 2026-10-16  -25.00  SQ *LITTLE OWL CAFE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'f007916f-3bd7-488a-808a-a078be3fbd27', -25.00, 'cleared', 'SQ *LITTLE OWL CAFE', '2026-10-16');

-- 2026-10-16  -10.00  STARBUCKS
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'ba9a8635-762a-43de-86ee-5b33775bb5d9', -10.00, 'cleared', 'STARBUCKS', '2026-10-16');

-- 2026-10-16  -30.00  FRED M FUEL #9224   Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224   Q7', '2026-10-16');

-- 2026-10-16  -16.00  SUNRISE BAGEL & ESPRES
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -16.00, 'cleared', 'SUNRISE BAGEL & ESPRES', '2026-10-16');

-- 2026-10-16  -30.68  WENDYS AIRPRT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'e97eb306-7063-4fc9-99b8-060ce76b7ce3', -30.68, 'cleared', 'WENDYS AIRPRT', '2026-10-16');

-- 2026-10-17  -15.00  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -15.00, 'cleared', 'Sunrise Bagel & Espres', '2026-10-17');

-- 2026-10-17  -30.00  FRED M FUEL #9224   Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224   Q7', '2026-10-17');

-- 2026-10-17  -7.49  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -7.49, 'cleared', 'FRED MEYER #0224', '2026-10-17');

-- 2026-10-18  -15.25  SUNRISE BAGEL & ESPRES
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -15.25, 'cleared', 'SUNRISE BAGEL & ESPRES', '2026-10-18');

-- 2026-10-18  -30.00  FRED M FUEL #9224   Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224   Q7', '2026-10-18');

-- 2026-10-18  -7.28  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -7.28, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-18');

-- 2026-10-18  -43.00  Rosebud Marketing
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -43.00, 'cleared', 'Rosebud Marketing', '2026-10-18');

-- 2026-10-18  -6.85  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -6.85, 'cleared', 'McDonald''s Corporation', '2026-10-18');

-- 2026-10-19  -20.00  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -20.00, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-19');

-- 2026-10-19  -94.72  TURO INC.* TRIP OCT 20
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', '497e3f9a-7676-44e0-b109-7cc5dc3b0158', -94.72, 'cleared', 'TURO INC.* TRIP OCT 20', '2026-10-19');

-- 2026-10-20  -22.19  WAI EXPRESS
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'ca5031c3-5c58-490d-ab2b-7779218c9a5c', -22.19, 'cleared', 'WAI EXPRESS', '2026-10-20');

-- 2026-10-22  -323.00  9 LIVES AUTO
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', '346fe1d7-584c-48d4-8653-6e743b276e44', -323.00, 'cleared', '9 LIVES AUTO', '2026-10-22');

-- 2026-10-23  -20.00  WAI EXPRESS
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'ca5031c3-5c58-490d-ab2b-7779218c9a5c', -20.00, 'cleared', 'WAI EXPRESS', '2026-10-23');

-- 2026-10-23  -1.99  WAI EXPRESS
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'ca5031c3-5c58-490d-ab2b-7779218c9a5c', -1.99, 'cleared', 'WAI EXPRESS', '2026-10-23');

-- 2026-10-23  -19.48  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -19.48, 'cleared', 'LW GENERAL STORE BADGE', '2026-10-23');

-- 2026-10-24  -2.59  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -2.59, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-24');

-- 2026-10-24  -30.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-10-24');

-- 2026-10-24  -22.64  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -22.64, 'cleared', 'FRED MEYER #0224', '2026-10-24');

-- 2026-10-24  -7.00  SQ *THUMBS UP BY GNAP
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'f78e2e1d-f9fa-4f2b-a51e-475c10736ba7', -7.00, 'cleared', 'SQ *THUMBS UP BY GNAP', '2026-10-24');

-- 2026-10-24  -8.75  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -8.75, 'cleared', 'McDonald''s Corporation', '2026-10-24');

-- 2026-10-25  -30.00  FRED M FUEL #9224   Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224   Q7', '2026-10-25');

-- 2026-10-25  -3.69  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -3.69, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-25');

-- 2026-10-25  -33.30  WENDYS AIRPRT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'e97eb306-7063-4fc9-99b8-060ce76b7ce3', -33.30, 'cleared', 'WENDYS AIRPRT', '2026-10-25');

-- 2026-10-25  -31.63  WENDYS AIRPRT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'e97eb306-7063-4fc9-99b8-060ce76b7ce3', -31.63, 'cleared', 'WENDYS AIRPRT', '2026-10-25');

-- 2026-10-26  -10.00  STARBUCKS
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'ba9a8635-762a-43de-86ee-5b33775bb5d9', -10.00, 'cleared', 'STARBUCKS', '2026-10-26');

-- 2026-10-26  -4.50  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -4.50, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-26');

-- 2026-10-26  -23.00  Rosebud Marketing
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -23.00, 'cleared', 'Rosebud Marketing', '2026-10-26');

-- 2026-10-26  -20.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -20.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-10-26');

-- 2026-10-26  -39.58  BREWSTER S RESTAURANT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '0dec2ead-f20e-4eb3-b959-d40e086ff7dd', -39.58, 'cleared', 'BREWSTER S RESTAURANT', '2026-10-26');

-- 2026-10-27  -3.98  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -3.98, 'cleared', 'LW GENERAL STORE BADGE', '2026-10-27');

-- 2026-10-27  -4.48  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -4.48, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-27');

-- 2026-10-27  -30.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-10-27');

-- 2026-10-27  -41.74  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -41.74, 'cleared', 'FRED MEYER #0224', '2026-10-27');

-- 2026-10-29  -21.09  Netflix.com
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', '3d5214ec-5d9c-4550-aa5c-ab954fb61a1c', -21.09, 'cleared', 'Netflix.com', '2026-10-29');

-- 2026-10-30  -43.49  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -43.49, 'cleared', 'FRED MEYER #0224', '2026-10-30');

-- 2026-10-30  -26.00  SQ *YES NOODLE SOUP
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'cc8fd269-85ba-42e7-b5e3-436c663341f5', -26.00, 'cleared', 'SQ *YES NOODLE SOUP', '2026-10-30');

-- 2026-10-30  -8.79  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -8.79, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-10-30');

-- 2026-10-30  -30.00  FRED M FUEL #9224   Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224   Q7', '2026-10-30');

-- 2026-10-30  -34.03  SAFEWAY #1821
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', '10da1df2-73fb-4697-ab47-272195075679', -34.03, 'cleared', 'SAFEWAY #1821', '2026-10-30');
-- ============ Nature's Releaf (9 ATM cash-outs) ============
-- Each CSV total = round cash figure + flat $3 Nature's Releaf ATM
-- surcharge (both inside the CSV total); PLUS a separate $2.50 Venmo
-- network fee Venmo's own CSV never itemizes at all (same convention
-- established in 2026-09-08-venmo-reconcile-dedupe2.sql).

-- 2026-09-20  cash-out, CSV total -83.00 = cash -80.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -80.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-09-20');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-09-20');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-09-20');

-- 2026-09-22  cash-out, CSV total -23.00 = cash -20.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -20.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-09-22');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-09-22');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-09-22');

-- 2026-09-22  cash-out, CSV total -23.00 = cash -20.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -20.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-09-22');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-09-22');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-09-22');

-- 2026-10-01  cash-out, CSV total -63.00 = cash -60.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -60.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-10-01');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-10-01');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-01');

-- 2026-10-03  cash-out, CSV total -63.00 = cash -60.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -60.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-10-03');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-10-03');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-03');

-- 2026-10-05  cash-out, CSV total -23.00 = cash -20.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -20.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-10-05');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-10-05');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-05');

-- 2026-10-05  cash-out, CSV total -23.00 = cash -20.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -20.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-10-05');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-10-05');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-05');

-- 2026-10-06  cash-out, CSV total -63.00 = cash -60.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -60.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-10-06');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-10-06');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-06');

-- 2026-10-12  cash-out, CSV total -203.00 = cash -200.00 + $3 ATM fee + separate $2.50 Venmo fee
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -200.00, 'cleared', 'Nature''s Releaf — cash withdrawal', '2026-10-12');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -3.00, 'cleared', 'Fee: Nature''s Releaf ATM surcharge', '2026-10-12');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-12');


-- ============ PAI ATM (1 cash-out) ============
-- 2026-10-26  CSV total -43.00 = cash -40.00 + $3 ATM fee + separate $2.50 Venmo fee (same convention as Nature's Releaf)
insert into public.transactions (household_id, account_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'c8205f75-7c4f-4ded-a4bd-e2dc2be2c48d', -40.00, 'cleared', 'PAI ATM — cash withdrawal', '2026-10-26');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'c8205f75-7c4f-4ded-a4bd-e2dc2be2c48d', -3.00, 'cleared', 'Fee: PAI ATM surcharge', '2026-10-26');
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-26');
-- ============ Cleo: 3 new advances (10/15, 10/16, 10/20) + repayments ============
-- Per the user: 3 $55 draws landed in Venmo as 'Money added' lines, but only
-- one (10/20, UTC-stamped 10/21) appears in this CSV export at all -- the other
-- two are a real CSV omission, confirmed directly against the Venmo app's own
-- transaction list (same class of gap as the already-documented 'CSV doesn't
-- self-balance' limitation). Trusting the user's own Cleo/Venmo records over
-- the CSV here.
-- 10/22 repayment ($81.97) = $55 principal (closing the 10/15 draw) + 3x$8.99
-- express fees ($26.97, one per draw, billed together). 10/31 repayment ($55)
-- closes the 10/16 draw. The 10/20 draw ($55) is still open after this --
-- its own repayment (11/3) is outside this statement's date range.

-- 2026-10-15  +55.00  Advance: Cleo
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, linked_debt_id, amount, status, description, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, '085f2811-f7b3-4491-a32e-869a747dfd4b', 55.00, 'cleared', 'Advance: Cleo', '2026-10-15');
  insert into public.debt_adjustments (household_id, debt_id, amount, adjustment_type, description, adjustment_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '085f2811-f7b3-4491-a32e-869a747dfd4b', 55.00, 'advance', 'Advance: Cleo', '2026-10-15');
end $$;

-- 2026-10-16  +55.00  Advance: Cleo
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, linked_debt_id, amount, status, description, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, '085f2811-f7b3-4491-a32e-869a747dfd4b', 55.00, 'cleared', 'Advance: Cleo', '2026-10-16');
  insert into public.debt_adjustments (household_id, debt_id, amount, adjustment_type, description, adjustment_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '085f2811-f7b3-4491-a32e-869a747dfd4b', 55.00, 'advance', 'Advance: Cleo', '2026-10-16');
end $$;

-- 2026-10-20  +55.00  Advance: Cleo
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, linked_debt_id, amount, status, description, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, '085f2811-f7b3-4491-a32e-869a747dfd4b', 55.00, 'cleared', 'Advance: Cleo', '2026-10-20');
  insert into public.debt_adjustments (household_id, debt_id, amount, adjustment_type, description, adjustment_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '085f2811-f7b3-4491-a32e-869a747dfd4b', 55.00, 'advance', 'Advance: Cleo', '2026-10-20');
end $$;

-- 2026-10-22  -81.97  CLEO* ADVANCE+EXPRESS = $55 principal + 3x $8.99 express fee
insert into public.transactions (household_id, account_id, linked_debt_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '085f2811-f7b3-4491-a32e-869a747dfd4b', -55.00, 'cleared', 'Debt payment · Cleo', '2026-10-22');
insert into public.debt_adjustments (household_id, debt_id, amount, adjustment_type, description, adjustment_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '085f2811-f7b3-4491-a32e-869a747dfd4b', -55.00, 'repayment', 'Debt payment · Cleo', '2026-10-22');
insert into public.transactions (household_id, account_id, category_id, linked_debt_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '085f2811-f7b3-4491-a32e-869a747dfd4b', -8.99, 'cleared', 'Fee: Cleo · advance fee — Express fee (10/15 advance)', '2026-10-22');
insert into public.transactions (household_id, account_id, category_id, linked_debt_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '085f2811-f7b3-4491-a32e-869a747dfd4b', -8.99, 'cleared', 'Fee: Cleo · advance fee — Express fee (10/16 advance)', '2026-10-22');
insert into public.transactions (household_id, account_id, category_id, linked_debt_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '085f2811-f7b3-4491-a32e-869a747dfd4b', -8.99, 'cleared', 'Fee: Cleo · advance fee — Express fee (10/20 advance)', '2026-10-22');

-- 2026-10-31  -55.00  CLEO* ADVANCE REPAY
insert into public.transactions (household_id, account_id, linked_debt_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '085f2811-f7b3-4491-a32e-869a747dfd4b', -55.00, 'cleared', 'Debt payment · Cleo', '2026-10-31');
insert into public.debt_adjustments (household_id, debt_id, amount, adjustment_type, description, adjustment_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '085f2811-f7b3-4491-a32e-869a747dfd4b', -55.00, 'repayment', 'Debt payment · Cleo', '2026-10-31');

-- Raw inserts above don't trigger the app's apply_debt_adjustment RPC, so
-- remaining_balance/minimum_payment need the same explicit update every
-- other migration in this series relies on. Net: +165 (3 draws) - 55 - 55
-- (2 of 3 repayments; the 3rd lands 11/3, outside this statement) = +55 on
-- top of the current $0.00 balance.
update public.debts set remaining_balance = 55.00, minimum_payment = 55.00 where id = '085f2811-f7b3-4491-a32e-869a747dfd4b';

-- ============ Cash App transfers (your own card, sending to $laszloffy) ============
-- 2026-10-25  transfer -10.00 Venmo -> Cash App (laszloffy)
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -10.00, 'cleared', '2026-10-25');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '7a6e9dd0-74a8-4014-8b0b-59c5a004229e', grp, 10.00, 'cleared', '2026-10-25');
end $$;

-- 2026-10-27  transfer -33.00 Venmo -> Cash App (laszloffy)
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -33.00, 'cleared', '2026-10-27');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '7a6e9dd0-74a8-4014-8b0b-59c5a004229e', grp, 33.00, 'cleared', '2026-10-27');
end $$;

-- ============ Rent (via Flex), second half of October ============
-- NOTE: Rent (via Flex) bill's next_due_date is stuck at 2026-09-01 --
-- these 2 payments alone won't fully catch it up. That's a bigger gap than
-- this Venmo pass covers; flagging for a separate session.
-- 2026-10-25  -100.00  Bill payment · Rent (via Flex)
insert into public.transactions (household_id, account_id, linked_bill_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'e51d00e3-ad6e-41c5-9ad4-4e12eb204191', -100.00, 'cleared', 'Bill payment · Rent (via Flex)', '2026-10-25');

-- 2026-10-30  -724.00  Bill payment · Rent (via Flex)
insert into public.transactions (household_id, account_id, linked_bill_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'e51d00e3-ad6e-41c5-9ad4-4e12eb204191', -724.00, 'cleared', 'Bill payment · Rent (via Flex)', '2026-10-30');

-- ============ Generic 'Google' charges (wife's mobile-game IAPs, app unknown) ============
-- 2026-10-06  -1.04  Google (app not identifiable from the statement)
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', -1.04, 'cleared', 'Google', '2026-10-06');

-- 2026-10-13  -1.04  Google (app not identifiable from the statement)
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', -1.04, 'cleared', 'Google', '2026-10-13');

-- 2026-10-27  -10.54  Google (app not identifiable from the statement)
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', -10.54, 'cleared', 'Google', '2026-10-27');

-- ============ UberEats order ============
-- 2026-10-24  -21.05  UBER * EATS PENDING
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'd8f0d0f6-7e50-47c6-82de-8051effedd11', -21.05, 'cleared', 'UBER * EATS PENDING', '2026-10-24');
-- ============ Instant Transfer (Venmo -> Visa *6002/vypr907 Cash App, Visa *1661/USAA) ============
-- 2026-09-22  transfer -15.26 -> Classic Checking (USAA) (Visa *1661), fee -0.26
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -15.00, 'cleared', '2026-09-22');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', grp, 15.00, 'cleared', '2026-09-22');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.26, 'cleared', 'Fee: Transfer', '2026-09-22', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-10-16  transfer -58.93 -> vypr907 Cash App (Visa *6002), fee -1.03
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -57.90, 'cleared', '2026-10-16');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '64b5d727-f7b7-450e-aabc-6011c1088423', grp, 57.90, 'cleared', '2026-10-16');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -1.03, 'cleared', 'Fee: Transfer', '2026-10-16', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-10-17  transfer -71.24 -> vypr907 Cash App (Visa *6002), fee -1.24
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -70.00, 'cleared', '2026-10-17');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '64b5d727-f7b7-450e-aabc-6011c1088423', grp, 70.00, 'cleared', '2026-10-17');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -1.24, 'cleared', 'Fee: Transfer', '2026-10-17', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-10-19  transfer -87.49 -> vypr907 Cash App (Visa *6002), fee -1.53
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -85.96, 'cleared', '2026-10-19');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '64b5d727-f7b7-450e-aabc-6011c1088423', grp, 85.96, 'cleared', '2026-10-19');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -1.53, 'cleared', 'Fee: Transfer', '2026-10-19', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-10-24  transfer -20.35 -> vypr907 Cash App (Visa *6002), fee -0.35
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -20.00, 'cleared', '2026-10-24');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '64b5d727-f7b7-450e-aabc-6011c1088423', grp, 20.00, 'cleared', '2026-10-24');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.35, 'cleared', 'Fee: Transfer', '2026-10-24', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- ============ Standard Transfer (Venmo -> One Checking - Steven) ============
-- 2026-10-25  transfer -5.00 -> One Checking - Steven
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -5.00, 'cleared', '2026-10-25');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', grp, 5.00, 'cleared', '2026-10-25');
end $$;

-- 2026-10-27  transfer -5.00 -> One Checking - Steven
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -5.00, 'cleared', '2026-10-27');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', grp, 5.00, 'cleared', '2026-10-27');
end $$;

-- ============ Instant Add Funds -- UberEats cash-out income (not the $100 Instacash draws, already logged elsewhere) ============
-- 2026-10-17  +73.37  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 73.37, 'cleared', 'Paycheck: UberEats', '2026-10-17');

-- 2026-10-18  +125.15  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 125.15, 'cleared', 'Paycheck: UberEats', '2026-10-18');

-- 2026-10-19  +363.24  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 363.24, 'cleared', 'Paycheck: UberEats', '2026-10-19');

-- 2026-10-20  +55.00  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 55.00, 'cleared', 'Paycheck: UberEats', '2026-10-20');

-- 2026-10-23  +39.72  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 39.72, 'cleared', 'Paycheck: UberEats', '2026-10-23');

-- 2026-10-25  +152.69  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 152.69, 'cleared', 'Paycheck: UberEats', '2026-10-25');

-- 2026-10-26  +10.00  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 10.00, 'cleared', 'Paycheck: UberEats', '2026-10-26');

-- 2026-10-27  +45.58  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 45.58, 'cleared', 'Paycheck: UberEats', '2026-10-27');

-- 2026-10-27  +80.22  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 80.22, 'cleared', 'Paycheck: UberEats', '2026-10-27');

-- 2026-10-30  +724.00  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 724.00, 'cleared', 'Paycheck: UberEats', '2026-10-30');

-- 2026-10-30  +72.38  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 72.38, 'cleared', 'Paycheck: UberEats', '2026-10-30');

-- 2026-10-30  +72.30  Paycheck: UberEats (instant cash-out)
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 72.30, 'cleared', 'Paycheck: UberEats', '2026-10-30');

-- SKIPPED 5 x $100.00 Instant Add Funds -- MoneyLion/Instacash advances
-- already recorded against that debt via separate larger entries; adding
-- these would double-count the advance.

-- ============ Direct Deposit (UberEats EDI) ============
-- 2026-10-19  +1.00  Paycheck: UberEats
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 1.00, 'cleared', 'Paycheck: UberEats', '2026-10-19');

-- 2026-10-26  +19.30  Paycheck: UberEats
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 19.30, 'cleared', 'Paycheck: UberEats', '2026-10-26');

-- ============ Venmo account repayment ============
-- Per the user: a failed UberEats instant cash-out was reversed after the
-- cashed-out money had already been spent, leaving the Venmo balance
-- negative; this is them covering that shortfall.
-- 2026-09-11  -49.35  Venmo account repayment
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -49.35, 'cleared', 'Venmo balance repayment (failed UberEats cash-out reversal)', '2026-09-11');

commit;
