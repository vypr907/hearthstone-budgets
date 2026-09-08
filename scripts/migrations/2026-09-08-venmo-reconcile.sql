-- 2026-09-08 — Venmo statement reconciliation (Jul 1 - Sep 8 2026), Our Household.
-- Data-only. Run in the Supabase SQL Editor. No schema change.
--
-- Source: 3 Venmo monthly statement CSVs (planning/*.csv, gitignored) compared
-- against the app's "Venmo - Steven" account via scripts/reconcile-venmo-csv.mjs.
-- 143 transactions present on Venmo's own statements were never logged in the
-- app; this migration adds them. Categorization decided interactively with the
-- user per merchant/type (see docs/SESSION.md for the full interview log).
--
-- Explicitly OUT of scope (per user decision): the ~$930 (Aug) / ~$105 (Sep)
-- gap between each statement's own Beginning+Activity and Ending Balance,
-- beyond what "Paycheck: UberEats" already covers — every statement's own
-- numbers don't self-balance (Venmo's CSV export omits some incoming activity
-- from the itemized list even though it hits the balance), so it can't be
-- used as evidence the app's existing income entries are wrong. Not touched.
--
-- Instant Transfer / Standard Transfer / Instant Add Funds rows are modeled as
-- ADR-056 two-leg transfers (+ ADR-097 fee row where Venmo charged one),
-- exactly like a manual Transfer entry in the app, per destination account
-- confirmed by the user:
--   Mastercard *0461 -> Steph One Checking   f12279ca-...
--   Visa *1661        -> Classic Checking (USAA) 2e937b2d-...
--   THE BANCORP BANK *4019 -> SoFi Checking  fd8be012-...
--   Mastercard *0491  -> One Checking - Steven (funds Venmo, not from it) 40124cdf-...
--
-- IDs (Our Household cd8bce8c-81af-4302-8019-113e352ed443):
--   account     Venmo - Steven        9a1a0f9a-c966-4038-a108-36766faf83d3
--   institution Venmo                 edf5c0ca-f45b-4709-b159-053977f32903
--   debt        Milestone             9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c
--   category    Fees                  be4f75e5-9ba0-4637-a790-ee9ce21bb83f
--
-- 4 new institutions, confirmed with the user (none existed already —
-- verified against the full institutions list first, per user's request,
-- which also caught 5 existing Google-app charges I'd wrongly generalized
-- to "Google One" instead of their own dedicated institutions):
--   DAWG Self Discipline
--   The Sheet Code
--   FTWW Express Shoppette
--   Gyro and More Falafel

begin;

-- New institutions (institution_type 'other', matching every comparable
-- merchant/app institution in this household — see docs/SESSION.md).
insert into public.institutions (id, household_id, name, institution_type) values
  ('9ee04161-b1ce-4146-aaad-6f744df76310', 'cd8bce8c-81af-4302-8019-113e352ed443', 'DAWG Self Discipline', 'other');
insert into public.institutions (id, household_id, name, institution_type) values
  ('2f4cecec-e803-46b8-8e76-0806064a27dc', 'cd8bce8c-81af-4302-8019-113e352ed443', 'The Sheet Code', 'other');
insert into public.institutions (id, household_id, name, institution_type) values
  ('ca5031c3-5c58-490d-ab2b-7779218c9a5c', 'cd8bce8c-81af-4302-8019-113e352ed443', 'FTWW Express Shoppette', 'other');
insert into public.institutions (id, household_id, name, institution_type) values
  ('4043c8be-7c50-4077-a369-ade9272371fa', 'cd8bce8c-81af-4302-8019-113e352ed443', 'Gyro and More Falafel', 'other');

-- 2026-07-01  transfer -15.00 -> Classic Checking (USAA), fee -0.26
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -15.00, 'cleared', '2026-07-01');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', grp, 15.00, 'cleared', '2026-07-01');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.26, 'cleared', 'Fee: Transfer', '2026-07-01', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-01  standard transfer -40.00 -> SoFi Checking (no fee)
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -40.00, 'cleared', '2026-07-01');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'fd8be012-2658-4a9c-bff0-51c336f5837a', grp, 40.00, 'cleared', '2026-07-01');
end $$;

-- 2026-07-01  transfer -5.00 -> Classic Checking (USAA), fee -0.25
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -5.00, 'cleared', '2026-07-01');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '2e937b2d-471a-46f3-9a9d-cfc342a66414', grp, 5.00, 'cleared', '2026-07-01');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.25, 'cleared', 'Fee: Transfer', '2026-07-01', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-02  -2.00  Payment to Amber Beach: sf monster
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', -2.00, 'cleared', 'sf monster', '2026-07-02');

-- 2026-07-02  -10.27  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -10.27, 'cleared', 'LW GENERAL STORE BADGE', '2026-07-02');

-- 2026-07-02  -30.64  WM SUPERCENTER #2722
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '9f744387-56ee-4d42-a5b2-59afda81f3eb', '85e88a17-bd0a-4a5f-8967-0c86cfa39c7c', -30.64, 'cleared', 'WM SUPERCENTER #2722', '2026-07-02');

-- 2026-07-03  -6.70  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -6.70, 'cleared', 'McDonald''s Corporation', '2026-07-03');

-- 2026-07-03  transfer -40.00 -> Steph One Checking, fee -0.71
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -40.00, 'cleared', '2026-07-03');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 40.00, 'cleared', '2026-07-03');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.71, 'cleared', 'Fee: Transfer', '2026-07-03', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-03  -65.43  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -65.43, 'cleared', 'FRED MEYER #0224', '2026-07-03');

-- 2026-07-03  -6.48  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -6.48, 'cleared', 'LW GENERAL STORE BADGE', '2026-07-03');

-- 2026-07-04  -1.19  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -1.19, 'cleared', 'FRED MEYER #0224', '2026-07-04');

-- 2026-07-04  -18.02  SAFEWAY #3410
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', '10da1df2-73fb-4697-ab47-272195075679', -18.02, 'cleared', 'SAFEWAY #3410', '2026-07-04');

-- 2026-07-04  -122.50  FRED-MEYER #0485
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -122.50, 'cleared', 'FRED-MEYER #0485', '2026-07-04');

-- 2026-07-05  -8.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -8.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-05');

-- 2026-07-05  -18.97  O'REILLY 6066
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'cdda28fd-798c-48e5-9024-b54339806745', -18.97, 'cleared', 'O''REILLY 6066', '2026-07-05');

-- 2026-07-05  -11.10  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -11.10, 'cleared', 'McDonald''s Corporation', '2026-07-05');

-- 2026-07-05  transfer -50.00 -> Steph One Checking, fee -0.89
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -50.00, 'cleared', '2026-07-05');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 50.00, 'cleared', '2026-07-05');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.89, 'cleared', 'Fee: Transfer', '2026-07-05', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-05  -41.94  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -41.94, 'cleared', 'FRED MEYER #0224', '2026-07-05');

-- 2026-07-05  -3.29  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -3.29, 'cleared', 'LW GENERAL STORE BADGE', '2026-07-05');

-- 2026-07-06  -8.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -8.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-06');

-- 2026-07-06  -8.68  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -8.68, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-06');

-- 2026-07-06  -41.94  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -41.94, 'cleared', 'FRED MEYER #0224', '2026-07-06');

-- 2026-07-06  -40.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -40.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-07-06');

-- 2026-07-06  -39.58  BREWSTER'S RESTAURANT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '0dec2ead-f20e-4eb3-b959-d40e086ff7dd', -39.58, 'cleared', 'BREWSTER''S RESTAURANT', '2026-07-06');

-- 2026-07-06  -45.00  SQ *VAPE GIFT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'ba75812a-bb5b-4ab2-b5c5-984c76345e51', '52d0e913-6413-472e-8a5a-0aadb2a43c5d', -45.00, 'cleared', 'SQ *VAPE GIFT', '2026-07-06');

-- 2026-07-06  8.71  small EDI deposit
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 8.71, 'cleared', 'EDI PAYMNT (UberEats)', '2026-07-06');

-- 2026-07-07  -8.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -8.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-07');

-- 2026-07-07  -63.62  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -63.62, 'cleared', 'FRED MEYER #0224', '2026-07-07');

-- 2026-07-07  instant add funds 10.00 <- One Checking - Steven
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, 10.00, 'cleared', '2026-07-07');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', grp, -10.00, 'cleared', '2026-07-07');
end $$;

-- 2026-07-07  transfer -15.00 -> Steph One Checking, fee -0.26
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -15.00, 'cleared', '2026-07-07');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 15.00, 'cleared', '2026-07-07');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.26, 'cleared', 'Fee: Transfer', '2026-07-07', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-09  -44.18  SAFEWAY #1821
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', '10da1df2-73fb-4697-ab47-272195075679', -44.18, 'cleared', 'SAFEWAY #1821', '2026-07-09');

-- 2026-07-09  -20.12  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -20.12, 'cleared', 'FRED MEYER #0224', '2026-07-09');

-- 2026-07-10  -8.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -8.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-10');

-- 2026-07-10  -6.48  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -6.48, 'cleared', 'LW GENERAL STORE BADGE', '2026-07-10');

-- 2026-07-10  -4.99  CIRCLEK#2746622 2300 S
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -4.99, 'cleared', 'CIRCLEK#2746622 2300 S', '2026-07-10');

-- 2026-07-10  -21.42  JIM.COM* MURAD AHMMAD
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '4043c8be-7c50-4077-a369-ade9272371fa', -21.42, 'cleared', 'JIM.COM* MURAD AHMMAD', '2026-07-10');

-- 2026-07-11  -8.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -8.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-11');

-- 2026-07-11  -4.99  CIRCLEK#2746622 2300 S
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -4.99, 'cleared', 'CIRCLEK#2746622 2300 S', '2026-07-11');

-- 2026-07-11  -10.24  SONIC DRIVE IN #6781
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '5ea01191-9746-4177-ad34-aec3a8d65bd3', -10.24, 'cleared', 'SONIC DRIVE IN #6781', '2026-07-11');

-- 2026-07-11  -18.29  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -18.29, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-11');

-- 2026-07-11  -39.33  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -39.33, 'cleared', 'FRED MEYER #0224', '2026-07-11');

-- 2026-07-11  -15.99  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -15.99, 'cleared', 'LW GENERAL STORE BADGE', '2026-07-11');

-- 2026-07-11  transfer -25.00 -> Steph One Checking, fee -0.44
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -25.00, 'cleared', '2026-07-11');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 25.00, 'cleared', '2026-07-11');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.44, 'cleared', 'Fee: Transfer', '2026-07-11', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-12  -18.69  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -18.69, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-12');

-- 2026-07-12  -11.10  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -11.10, 'cleared', 'McDonald''s Corporation', '2026-07-12');

-- 2026-07-12  transfer -30.00 -> Steph One Checking, fee -0.53
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -30.00, 'cleared', '2026-07-12');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 30.00, 'cleared', '2026-07-12');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.53, 'cleared', 'Fee: Transfer', '2026-07-12', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-12  -16.00  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -16.00, 'cleared', 'Sunrise Bagel & Espres', '2026-07-12');

-- 2026-07-12  -40.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -40.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-07-12');

-- 2026-07-12  -7.17  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -7.17, 'cleared', 'FRED MEYER #0224', '2026-07-12');

-- 2026-07-12  -7.39  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -7.39, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-12');

-- 2026-07-13  -8.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -8.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-13');

-- 2026-07-13  -8.28  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -8.28, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-13');

-- 2026-07-14  -7.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -7.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-14');

-- 2026-07-14  transfer -20.00 -> Steph One Checking, fee -0.35
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -20.00, 'cleared', '2026-07-14');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 20.00, 'cleared', '2026-07-14');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.35, 'cleared', 'Fee: Transfer', '2026-07-14', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-14  -9.99  UberEats
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'd8f0d0f6-7e50-47c6-82de-8051effedd11', -9.99, 'cleared', 'UberEats', '2026-07-14');

-- 2026-07-14  transfer -50.00 -> Steph One Checking, fee -0.89
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -50.00, 'cleared', '2026-07-14');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 50.00, 'cleared', '2026-07-14');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.89, 'cleared', 'Fee: Transfer', '2026-07-14', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-14  -6.70  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -6.70, 'cleared', 'McDonald''s Corporation', '2026-07-14');

-- 2026-07-14  -30.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-07-14');

-- 2026-07-14  -38.25  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -38.25, 'cleared', 'FRED MEYER #0224', '2026-07-14');

-- 2026-07-15  -10.40  SP THESHEETCODE.COM
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '5aefc3f2-664b-4fb7-815d-d656175ddb5d', '2f4cecec-e803-46b8-8e76-0806064a27dc', -10.40, 'cleared', 'SP THESHEETCODE.COM', '2026-07-15');

-- 2026-07-15  -4.00  Payment to Amber Beach: monster, 2 uncrustables
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', -4.00, 'cleared', 'monster, 2 uncrustables', '2026-07-15');

-- 2026-07-16  -7.00  Payment to Amber Beach: monster, 2 uncrustables, Philly
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', -7.00, 'cleared', 'monster, 2 uncrustables, Philly', '2026-07-16');

-- 2026-07-17  -6.99  Fee: Cleo · advance fee — Express fee
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '32ddce8d-df53-4de5-aadc-7818079f10da', -6.99, 'cleared', 'Fee: Cleo · advance fee — Express fee', '2026-07-17');

-- 2026-07-17  -30.00  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -30.00, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-17');

-- 2026-07-17  transfer -25.00 -> Steph One Checking, fee -0.44
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -25.00, 'cleared', '2026-07-17');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 25.00, 'cleared', '2026-07-17');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.44, 'cleared', 'Fee: Transfer', '2026-07-17', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-17  -16.67  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -16.67, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-17');

-- 2026-07-17  -3.99  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -3.99, 'cleared', 'LW GENERAL STORE BADGE', '2026-07-17');

-- 2026-07-18  -11.10  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -11.10, 'cleared', 'McDonald''s Corporation', '2026-07-18');

-- 2026-07-18  -8.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -8.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-18');

-- 2026-07-18  -30.99  O'REILLY 3106
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'cdda28fd-798c-48e5-9024-b54339806745', -30.99, 'cleared', 'O''REILLY 3106', '2026-07-18');

-- 2026-07-18  -40.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -40.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-07-18');

-- 2026-07-18  -14.37  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -14.37, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-18');

-- 2026-07-19  -11.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -11.50, 'cleared', 'Sunrise Bagel & Espres', '2026-07-19');

-- 2026-07-19  -13.96  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -13.96, 'cleared', 'FRED MEYER #0224', '2026-07-19');

-- 2026-07-19  -5.29  WAI EXPRESS
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'ca5031c3-5c58-490d-ab2b-7779218c9a5c', -5.29, 'cleared', 'WAI EXPRESS', '2026-07-19');

-- 2026-07-19  -13.49  PETCO 1147 -n61
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '8d2d98a2-bc3b-48bd-af33-4582c67aa042', 'b733b2dd-208d-4b81-a541-4a6b9d060faf', -13.49, 'cleared', 'PETCO 1147 -n61', '2026-07-19');

-- 2026-07-19  -30.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-07-19');

-- 2026-07-21  -7.00  Payment to Amber Beach: snacks
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', -7.00, 'cleared', 'snacks', '2026-07-21');

-- 2026-07-22  transfer -40.00 -> Steph One Checking, fee -0.71
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -40.00, 'cleared', '2026-07-22');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 40.00, 'cleared', '2026-07-22');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.71, 'cleared', 'Fee: Transfer', '2026-07-22', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-22  -6.00  Payment to Amber Beach: 2 Jimmy deans and 2 uncrustables
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', -6.00, 'cleared', '2 Jimmy deans and 2 uncrustables', '2026-07-22');

-- 2026-07-22  -19.46  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -19.46, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-22');

-- 2026-07-22  -40.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -40.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-07-22');

-- 2026-07-23  transfer -15.00 -> Steph One Checking, fee -0.26
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -15.00, 'cleared', '2026-07-23');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 15.00, 'cleared', '2026-07-23');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.26, 'cleared', 'Fee: Transfer', '2026-07-23', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-24  transfer -30.00 -> Steph One Checking, fee -0.53
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -30.00, 'cleared', '2026-07-24');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 30.00, 'cleared', '2026-07-24');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.53, 'cleared', 'Fee: Transfer', '2026-07-24', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-24  -6.00  Payment to Amber Beach: 2 Jimmy deans, 2 uncrustables
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', -6.00, 'cleared', '2 Jimmy deans, 2 uncrustables', '2026-07-24');

-- 2026-07-24  -6.78  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -6.78, 'cleared', 'FRED MEYER #0224', '2026-07-24');

-- 2026-07-24  -10.58  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -10.58, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-24');

-- 2026-07-24  -8.49  SAFEWAY #1821
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', '10da1df2-73fb-4697-ab47-272195075679', -8.49, 'cleared', 'SAFEWAY #1821', '2026-07-24');

-- 2026-07-24  -15.99  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -15.99, 'cleared', 'LW GENERAL STORE BADGE', '2026-07-24');

-- 2026-07-25  -25.31  GOOGLE *DAWG Self Disc
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '53e025fb-f19e-42b4-af7c-4f2bcb33d15c', '9ee04161-b1ce-4146-aaad-6f744df76310', -25.31, 'cleared', 'GOOGLE *DAWG Self Disc', '2026-07-25');

-- 2026-07-25  -16.00  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -16.00, 'cleared', 'Sunrise Bagel & Espres', '2026-07-25');

-- 2026-07-25  -30.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-07-25');

-- 2026-07-25  -8.42  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -8.42, 'cleared', 'McDonald''s Corporation', '2026-07-25');

-- 2026-07-25  -8.48  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -8.48, 'cleared', 'LW GENERAL STORE BADGE', '2026-07-25');

-- 2026-07-25  -2.10  Google Pixel Flow
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', -2.10, 'cleared', 'Google Pixel Flow', '2026-07-25');

-- 2026-07-26  -332.83  Uber
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', null, -332.83, 'cleared', 'Uber', '2026-07-26');

-- 2026-07-26  -2.40  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -2.40, 'cleared', 'McDonald''s Corporation', '2026-07-26');

-- 2026-07-27  transfer -1232.50 -> Steph One Checking, fee -21.95
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -1232.50, 'cleared', '2026-07-27');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 1232.50, 'cleared', '2026-07-27');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -21.95, 'cleared', 'Fee: Transfer', '2026-07-27', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-27  -59.75  Uber
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'd8f0d0f6-7e50-47c6-82de-8051effedd11', -59.75, 'cleared', 'Uber', '2026-07-27');

-- 2026-07-27  7.19  small EDI deposit
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 7.19, 'cleared', 'EDI PAYMNT (UberEats)', '2026-07-27');

-- 2026-07-28  -20.00  Milestone debt payment
insert into public.transactions (household_id, account_id, amount, status, description, transaction_date, linked_debt_id, institution_id) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -20.00, 'cleared', 'Debt payment · Milestone', '2026-07-28', '9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c', '764c51a2-dae7-4564-8590-747bc1f4198f');

-- 2026-07-28  -30.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -30.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-07-28');

-- 2026-07-28  transfer -70.00 -> Steph One Checking, fee -1.24
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -70.00, 'cleared', '2026-07-28');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 70.00, 'cleared', '2026-07-28');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -1.24, 'cleared', 'Fee: Transfer', '2026-07-28', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-28  -12.00  Payment to Amber Beach: 4 jimmeh deeens and 4 uncrustablesssss
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', -12.00, 'cleared', '4 jimmeh deeens and 4 uncrustablesssss', '2026-07-28');

-- 2026-07-28  -13.87  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -13.87, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-28');

-- 2026-07-29  -25.00  LOVABLE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '5aefc3f2-664b-4fb7-815d-d656175ddb5d', '13745bd0-20c1-4862-adf7-b25f32cb07c7', -25.00, 'cleared', 'LOVABLE', '2026-07-29');

-- 2026-07-29  transfer -75.00 -> Steph One Checking, fee -1.33
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -75.00, 'cleared', '2026-07-29');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 75.00, 'cleared', '2026-07-29');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -1.33, 'cleared', 'Fee: Transfer', '2026-07-29', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-07-29  -9.00  Payment to Amber Beach: 2 jimmy dean, 1 philly, 2 fruit snack, and 2 uncrustables
insert into public.transactions (household_id, account_id, category_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', -9.00, 'cleared', '2 jimmy dean, 1 philly, 2 fruit snack, and 2 uncrustables', '2026-07-29');

-- 2026-07-29  -12.67  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -12.67, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-07-29');

-- 2026-07-29  -2.10  GOOGLE *Pixel Flow
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', -2.10, 'cleared', 'GOOGLE *Pixel Flow', '2026-07-29');

-- 2026-07-29  -8.42  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -8.42, 'cleared', 'McDonald''s Corporation', '2026-07-29');

-- 2026-07-29  -2.10  GOOGLE *Pixel Flow
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', -2.10, 'cleared', 'GOOGLE *Pixel Flow', '2026-07-29');

-- 2026-07-29  -2.10  Google Pixel Flow
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', -2.10, 'cleared', 'Google Pixel Flow', '2026-07-29');

-- 2026-07-29  -2.10  Google Pixel Flow
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', -2.10, 'cleared', 'Google Pixel Flow', '2026-07-29');

-- 2026-07-30  -6.70  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -6.70, 'cleared', 'McDonald''s Corporation', '2026-07-30');

-- 2026-07-30  -8.43  GOOGLE *Pixel Flow
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', -8.43, 'cleared', 'GOOGLE *Pixel Flow', '2026-07-30');

-- 2026-08-02  -7.50  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -7.50, 'cleared', 'Sunrise Bagel & Espres', '2026-08-02');

-- 2026-08-02  -40.00  FRED M FUEL #9224 Q7
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -40.00, 'cleared', 'FRED M FUEL #9224 Q7', '2026-08-02');

-- 2026-08-02  -2.10  Google Pixel Flow
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', -2.10, 'cleared', 'Google Pixel Flow', '2026-08-02');

-- 2026-08-03  -19.98  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -19.98, 'cleared', 'LW GENERAL STORE BADGE', '2026-08-03');

-- 2026-08-04  -10.54  Google Finch Self Car
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '53e025fb-f19e-42b4-af7c-4f2bcb33d15c', '1fc5cbdc-d676-4456-bfe8-0afb348c9fc6', -10.54, 'cleared', 'Google Finch Self Car', '2026-08-04');

-- 2026-08-05  -9.48  CIRCLEK#2746640 575 HA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a07b6ff7-6121-4bbb-9489-67beb5e3f2bc', -9.48, 'cleared', 'CIRCLEK#2746640 575 HA', '2026-08-05');

-- 2026-08-05  -5.26  Google Watcher of Rea
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'b7424878-1ad5-4eb2-8f8f-dbc276a40a0d', -5.26, 'cleared', 'Google Watcher of Rea', '2026-08-05');

-- 2026-08-06  -9.10  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -9.10, 'cleared', 'McDonald''s Corporation', '2026-08-06');

-- 2026-08-06  transfer -50.00 -> Steph One Checking, fee -0.89
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -50.00, 'cleared', '2026-08-06');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 50.00, 'cleared', '2026-08-06');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.89, 'cleared', 'Fee: Transfer', '2026-08-06', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-08-07  transfer -25.00 -> Steph One Checking, fee -0.44
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -25.00, 'cleared', '2026-08-07');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 25.00, 'cleared', '2026-08-07');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.44, 'cleared', 'Fee: Transfer', '2026-08-07', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-08-07  transfer -25.00 -> Steph One Checking, fee -0.44
do $$
declare grp uuid := gen_random_uuid();
begin
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', grp, -25.00, 'cleared', '2026-08-07');
  insert into public.transactions (household_id, account_id, transfer_group_id, amount, status, transaction_date) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', 'f12279ca-91e4-4c1a-9e1a-f62d7d26e6e1', grp, 25.00, 'cleared', '2026-08-07');
  insert into public.transactions (household_id, account_id, category_id, split_group_id, amount, status, description, transaction_date, institution_id) values
    ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', grp, -0.44, 'cleared', 'Fee: Transfer', '2026-08-07', 'edf5c0ca-f45b-4709-b159-053977f32903');
end $$;

-- 2026-08-07  -1.04  Google Snapchat
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '537a29d6-b4b8-4eed-b4f0-4081cd74d4ef', '8688a388-f413-4ad2-8559-6f2db62f60e5', -1.04, 'cleared', 'Google Snapchat', '2026-08-07');

-- 2026-08-15  -7.33  GOOGLE *GigU Drive Sma
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '5aefc3f2-664b-4fb7-815d-d656175ddb5d', '2951b5c8-5fd5-48d3-a62d-275a4e779df8', -7.33, 'cleared', 'GOOGLE *GigU Drive Sma', '2026-08-15');

-- 2026-08-17  -10.00  SIAM SQUARE THAI RESTA
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '7ce9f1fd-3e8d-4f65-9542-e298381b9988', -10.00, 'cleared', 'SIAM SQUARE THAI RESTA', '2026-08-17');

-- 2026-08-18  -25.28  UBER * EATS PENDING
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'd8f0d0f6-7e50-47c6-82de-8051effedd11', -25.28, 'cleared', 'UBER * EATS PENDING', '2026-08-18');

-- 2026-08-18  -7.31  UBER *EATS HELP.UBER.C
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', 'd8f0d0f6-7e50-47c6-82de-8051effedd11', -7.31, 'cleared', 'UBER *EATS HELP.UBER.C', '2026-08-18');

-- 2026-08-18  -16.49  LW GENERAL STORE BADGE
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'a5daa10e-c0f0-40ba-8b83-5a817963421a', -16.49, 'cleared', 'LW GENERAL STORE BADGE', '2026-08-18');

-- 2026-08-18  -63.00  Nature s Releaf LLC MIN
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -63.00, 'cleared', 'Nature s Releaf LLC MIN', '2026-08-18');

-- 2026-08-21  -63.00  Nature s Releaf 3
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -63.00, 'cleared', 'Nature s Releaf 3', '2026-08-21');

-- 2026-08-22  -4.00  Sunrise Bagel & Espres
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '1b2f4ecc-abbc-4b8f-9e5a-e71ce65ab058', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', -4.00, 'cleared', 'Sunrise Bagel & Espres', '2026-08-22');

-- 2026-08-22  -43.00  Nature s Releaf 3
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -43.00, 'cleared', 'Nature s Releaf 3', '2026-08-22');

-- 2026-08-22  -46.76  BREWSTER'S RESTAURANT
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '0dec2ead-f20e-4eb3-b959-d40e086ff7dd', -46.76, 'cleared', 'BREWSTER''S RESTAURANT', '2026-08-22');

-- 2026-08-30  -10.20  McDonald's Corporation
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '016d03d5-6646-4b1b-9b10-c1189e3cc452', -10.20, 'cleared', 'McDonald''s Corporation', '2026-08-30');

-- 2026-08-30  -63.00  Nature s Releaf 3
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', -63.00, 'cleared', 'Nature s Releaf 3', '2026-08-30');

-- 2026-09-04  -9.00  SQ *NORTH POLE ALEHOUS
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '55e48250-f140-4328-ab05-8dc028ecfe41', '6489f2a0-5070-410f-83ae-a537879377b5', -9.00, 'cleared', 'SQ *NORTH POLE ALEHOUS', '2026-09-04');

-- 2026-09-06  -1.19  FRED MEYER #0224
insert into public.transactions (household_id, account_id, category_id, institution_id, amount, status, description, transaction_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', -1.19, 'cleared', 'FRED MEYER #0224', '2026-09-06');

commit;
