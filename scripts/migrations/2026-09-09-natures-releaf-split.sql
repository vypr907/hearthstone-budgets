-- 2026-09-09 — Rebuild the 4 Venmo-statement Nature's Releaf ATM cash-out
-- entries as proper 3-line category splits (cash + the two real fees),
-- and collapse a duplicated 8/30 event into one entry.
--
-- Per the user: every Venmo "Nature's Releaf" statement line is really
-- three things bundled together: cash received ($60 or $40), a $3 Nature's
-- Releaf ATM surcharge, and a separate $2.50 Venmo network fee. Splitting
-- them out (reusing the plain category-split mechanism already used
-- elsewhere in the ledger — no linked_bill_id/linked_debt_id, one shared
-- split_group_id per date) makes both fees visible from the cash line and
-- vice versa via the existing "Show breakdown" split UI, with no code
-- change required.
--
-- 8/18, 8/21, 8/22 today are single lump-sum rows ($65.50/$65.50/$45.50) —
-- correct in total, just not broken out. 8/30 is a genuine duplicate: one
-- lump -$63.00 row on 8/30 (missing the $2.50 Venmo fee) AND a separate
-- mis-dated 3-line split on 8/31 (-$60/-$5.50, the $5.50 already a lumped
-- NR+Venmo fee) for what Venmo's own statement shows as ONE $65.50 line on
-- 8/30 — both are replaced by a single correct 8/30 entry.
--
-- Independent of the 2026-09-08 dedupe/dedupe2 migrations — touches none of
-- the same rows; can be run before or after those.
--
-- Not in scope: the 8/29 "One Checking - Steven" $100+$3 split
-- (e9ba0b94.../943af212...) is a different account with no Venmo fee — a
-- separate real cash pull, left untouched.

begin;

-- Remove the 3 single lump-sum rows and the 8/30 lump + mis-dated 8/31 split.
delete from public.transactions where id in (
  'f5f10c39-ad44-4587-ad4c-128195329ed9',  -- 8/18 lump -65.50
  '7182e3da-b391-4a26-be9a-e70821e4c2bd',  -- 8/21 lump -65.50
  '34e34d45-2b99-424c-9141-3925efd68bc1',  -- 8/22 lump -45.50
  '396b4bc9-fc4f-4366-a16f-1f206db5155d',  -- 8/30 lump -63.00 (incomplete: missing $2.50 Venmo fee)
  'bcae3cea-dfe9-4fda-8683-2af14b869684',  -- 8/31 split cash -60.00 (mis-dated duplicate of the 8/30 event)
  '6c0121a8-923e-4518-88c8-ee4b98af659d'   -- 8/31 split fee -5.50 (mis-dated duplicate of the 8/30 event)
);

-- 8/18 — $65.50: $60 cash + $3 NR fee + $2.50 Venmo fee, split_group_id 02639b90-...
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, description, transaction_date, split_group_id)
values
  ('3c677c60-db78-4387-bd46-5d1d60d16ff6', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -60.00, 'cleared', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Nature''s Releaf', '2026-08-18', '02639b90-06c8-4b83-b3df-ecc2d1af40f2'),
  ('c3f40ff2-77a4-406b-be3d-e1dc8a6debef', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -3.00,  'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Nature''s Releaf ATM Fee', '2026-08-18', '02639b90-06c8-4b83-b3df-ecc2d1af40f2'),
  ('0b8ff55c-1197-44c4-ab18-0557191b906e', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -2.50,  'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Venmo ATM Fee', '2026-08-18', '02639b90-06c8-4b83-b3df-ecc2d1af40f2');

-- 8/21 — $65.50: $60 cash + $3 NR fee + $2.50 Venmo fee, split_group_id aeb68afa-...
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, description, transaction_date, split_group_id)
values
  ('23b411bf-513c-4324-8dc6-05d866f043e7', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -60.00, 'cleared', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Nature''s Releaf', '2026-08-21', 'aeb68afa-8ae9-49b6-a269-51f138087c56'),
  ('b8f1e30e-f535-494b-96bc-714296a1486f', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -3.00,  'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Nature''s Releaf ATM Fee', '2026-08-21', 'aeb68afa-8ae9-49b6-a269-51f138087c56'),
  ('89f33d50-145e-4b68-87fc-56e7d7c406d6', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -2.50,  'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Venmo ATM Fee', '2026-08-21', 'aeb68afa-8ae9-49b6-a269-51f138087c56');

-- 8/22 — $45.50: $40 cash + $3 NR fee + $2.50 Venmo fee, split_group_id a66b7976-...
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, description, transaction_date, split_group_id)
values
  ('5db0732f-bd8c-443b-b016-af1bb164d199', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -40.00, 'cleared', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Nature''s Releaf', '2026-08-22', 'a66b7976-eb0d-4e7c-b417-a8906e1acc50'),
  ('4f50b884-4213-4b69-947a-05d9d6f25d57', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -3.00,  'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Nature''s Releaf ATM Fee', '2026-08-22', 'a66b7976-eb0d-4e7c-b417-a8906e1acc50'),
  ('dfab719d-2337-4343-95de-aecfef082b64', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -2.50,  'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Venmo ATM Fee', '2026-08-22', 'a66b7976-eb0d-4e7c-b417-a8906e1acc50');

-- 8/30 — $65.50: $60 cash + $3 NR fee + $2.50 Venmo fee, split_group_id c52b9e29-...
-- (replaces the 8/30 lump -63.00 AND the mis-dated 8/31 split -60/-5.50)
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, description, transaction_date, split_group_id)
values
  ('ebbd7a54-e34c-46a3-a305-7f7e1fed9dd5', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -60.00, 'cleared', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Nature''s Releaf', '2026-08-30', 'c52b9e29-505f-4897-89c7-f6ea6deb74a0'),
  ('bc830ae8-78cf-43ea-a65c-efd70051a052', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -3.00,  'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Nature''s Releaf ATM Fee', '2026-08-30', 'c52b9e29-505f-4897-89c7-f6ea6deb74a0'),
  ('7eae8d72-bf06-4d7f-8aaa-1cfc8d0a8af6', 'cd8bce8c-81af-4302-8019-113e352ed443', '9a1a0f9a-c966-4038-a108-36766faf83d3', -2.50,  'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', 'Venmo ATM Fee', '2026-08-30', 'c52b9e29-505f-4897-89c7-f6ea6deb74a0');

commit;
