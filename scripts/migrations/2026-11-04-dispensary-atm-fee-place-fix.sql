-- 2026-11-04 — Fix dispensary ATM cash-out fee lines that predate per-line
-- place support (ADR-114). Data-only. Run in the Supabase SQL Editor. No
-- schema change.
--
-- Two patterns found by scanning the full household history for the $3
-- ATM-operator + $2.50 card-network fee combo (Nature's Releaf, Honeypot,
-- Pakalolo Supply Co. — all cash-only dispensaries per the user):
--
-- Pattern A (4 rows): amount already correctly split into two lines ($3 +
-- $2.50), but BOTH lines got tagged to the dispensary — the $2.50 line
-- should be tagged to whichever card/app actually charged the network fee
-- (Venmo, in all 4 cases). Simple institution_id correction, no new rows.
--
-- Pattern B (8 rows): never split at all — one combined -$5.50 line, no
-- description, tagged only to the dispensary. Split into the existing row
-- (kept as the $3 dispensary ATM surcharge, same split_group_id) plus one
-- new $2.50 row (Venmo for 7 of them; Cash App for the one dated 10/25,
-- which is on the vypr907 Cash App account, not Venmo). These groups pair
-- with a real transfer leg (Cash Back style, ADR-103) so they never showed
-- up in the generic split editor to fix by hand even after today's
-- per-line-place feature shipped — this is the one path available for them
-- short of a UI change to that editor's own exclusion rule.
--
-- IDs:
--   institution Venmo                edf5c0ca-f45b-4709-b159-053977f32903
--   institution Cash App             d10d7b32-aa01-45ac-9017-83ccbf938f35
--   institution Nature's Releaf LLC  f06240f2-c46e-45c2-b9d0-7161fb33d4e4
--   institution Honeypot             380fcec9-48eb-4a10-ad69-513d51c31c84
--   institution Pakalolo Supply Co.  5bb92435-4505-457f-9a6f-5d9a06ca3f92
--   category    Fees                 be4f75e5-9ba0-4637-a790-ee9ce21bb83f

begin;

-- ============ Pattern A: re-point the $2.50 line to Venmo (4 rows) ============
update public.transactions set institution_id = 'edf5c0ca-f45b-4709-b159-053977f32903'
where id in (
  '0b8ff55c-1197-44c4-ab18-0557191b906e', -- 2026-08-18
  '89f33d50-145e-4b68-87fc-56e7d7c406d6', -- 2026-08-21
  'dfab719d-2337-4343-95de-aecfef082b64', -- 2026-08-22
  '7eae8d72-bf06-4d7f-8aaa-1cfc8d0a8af6'  -- 2026-08-30
);

-- ============ Pattern B: split the lumped $5.50 line into $3 + $2.50 (8 groups) ============

-- 2026-09-19  Honeypot
update public.transactions set amount = -3.00, description = 'Fee: Honeypot ATM surcharge'
where id = '3d38d36a-4307-4ef8-91ea-879a43c1e123';
insert into public.transactions (household_id, account_id, category_id, institution_id, split_group_id, amount, status, description, transaction_date, cleared_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', 'f979377d-a49d-4527-83a7-7323cb3d4a78', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-09-19', '2026-09-19');

-- 2026-09-20  Honeypot
update public.transactions set amount = -3.00, description = 'Fee: Honeypot ATM surcharge'
where id = '67c04a44-066e-443f-94fd-1f8e814842bd';
insert into public.transactions (household_id, account_id, category_id, institution_id, split_group_id, amount, status, description, transaction_date, cleared_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', 'd5fd400a-f9f1-4834-bc45-a73b75f88da8', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-09-20', '2026-09-20');

-- 2026-09-20  Nature's Releaf
update public.transactions set amount = -3.00, description = 'Fee: Nature''s Releaf ATM surcharge'
where id = 'f3ac6270-53fa-4f7d-8b50-c90b2fc8cc99';
insert into public.transactions (household_id, account_id, category_id, institution_id, split_group_id, amount, status, description, transaction_date, cleared_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', 'ee0f916c-4776-4d63-8c47-a622a52def60', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-09-20', '2026-09-20');

-- 2026-09-22  Nature's Releaf (first of two that day)
update public.transactions set amount = -3.00, description = 'Fee: Nature''s Releaf ATM surcharge'
where id = 'e8ce6a99-4a33-416d-8fe8-6dd5ad05c9bc';
insert into public.transactions (household_id, account_id, category_id, institution_id, split_group_id, amount, status, description, transaction_date, cleared_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', 'e5f86549-3e42-45f5-bb80-97a017ec7ddb', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-09-22', '2026-09-22');

-- 2026-09-22  Nature's Releaf (second of two that day)
update public.transactions set amount = -3.00, description = 'Fee: Nature''s Releaf ATM surcharge'
where id = '0f8abcb5-da4d-47ab-9534-f81167056ae7';
insert into public.transactions (household_id, account_id, category_id, institution_id, split_group_id, amount, status, description, transaction_date, cleared_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', '886cdb01-66b0-44a5-91fc-cafa1f920883', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-09-22', '2026-09-22');

-- 2026-10-01  Pakalolo Supply Co.
update public.transactions set amount = -3.00, description = 'Fee: Pakalolo Supply Co. ATM surcharge'
where id = '728e1cb7-2c28-4163-b343-decb1620bdc6';
insert into public.transactions (household_id, account_id, category_id, institution_id, split_group_id, amount, status, description, transaction_date, cleared_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', '96ed1857-c427-453c-8aed-eeb9b025dc05', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-01', '2026-10-01');

-- 2026-10-01  Nature's Releaf
update public.transactions set amount = -3.00, description = 'Fee: Nature''s Releaf ATM surcharge'
where id = 'da532f1b-749f-4e11-9858-6c15d4927e23';
insert into public.transactions (household_id, account_id, category_id, institution_id, split_group_id, amount, status, description, transaction_date, cleared_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'edf5c0ca-f45b-4709-b159-053977f32903', '4be29c07-c9cc-46d2-ac26-0856eda73d34', -2.50, 'cleared', 'Fee: Venmo ATM network fee', '2026-10-01', '2026-10-01');

-- 2026-10-25  Nature's Releaf — on the vypr907 Cash App account, not Venmo,
-- so the $2.50 network fee belongs to Cash App, not Venmo.
update public.transactions set amount = -3.00, description = 'Fee: Nature''s Releaf ATM surcharge'
where id = 'fa9dc838-aa37-470a-83fa-6cf3f7c8f22e';
insert into public.transactions (household_id, account_id, category_id, institution_id, split_group_id, amount, status, description, transaction_date, cleared_date) values
  ('cd8bce8c-81af-4302-8019-113e352ed443', '64b5d727-f7b7-450e-aabc-6011c1088423', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'd10d7b32-aa01-45ac-9017-83ccbf938f35', '36c54456-210b-4732-a6bc-b3b9b8dc98dc', -2.50, 'cleared', 'Fee: Cash App ATM network fee', '2026-10-25', '2026-10-25');

commit;
