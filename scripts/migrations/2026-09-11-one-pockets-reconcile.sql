-- 2026-09-11 — One Finance savings pockets: Jul+Aug 2026 reconcile (Issue #61,
-- part 3 — "the 24 One savings-pocket reconciles"). Data-only, no schema
-- change.
--
-- METHOD: the OnePay statement PDFs (planning/2026-07.pdf, 2026-08.pdf) have
-- a real text layer (pdftotext -layout), so this pass parses every account's
-- Transaction History section programmatically instead of hand-transcribing
-- (planning/parse-one-statement.py -> one-statement-parsed.json). Every
-- parsed account's summed transactions match its printed TOTAL exactly, both
-- months, for all 26 One accounts (Checking, Savings, OnePay Advance
-- Overdraft, and 23 named pockets) — a hard tripwire against transcription
-- error.
--
-- SCOPE: of the 24 non-Checking pockets, only 6 had any Jul/Aug activity —
-- Steven's Savings (statement name "Savings" x0802), Emergency, Food, Games,
-- kitten's playroom, Pay Autosave — the same 6 the 2026-09-10 reconcile
-- already anchored at 8/31. The other 18 (Annuals, Auto-Save, Car, Clothing,
-- Fun, Gas, Gifts, Greens, Guns, Halo, Hobbies, House, Housing, Office, Pets,
-- Spend, Toiletries, Travel, Wedding) are verified $0.00 net in BOTH the
-- statement and the app's ledger for both months — nothing to reconcile,
-- no rows touched.
--
-- All 6 active pockets' existing 8/31 account_balances anchors already equal
-- the statement's real Aug-31 ending balance (planning/verify-pocket-fixes.py
-- confirms this), so no anchor changes are needed — only the transaction-
-- level detail leading up to each anchor.
--
-- FINDINGS (planning/diff-pockets.py + planning/verify-pocket-fixes.py — every
-- pocket-month below now reconciles to its statement to the penny):
--
-- Emergency (x0805):
--   Jul: -20 / -30 dated 7/29 in the app are the statement's 7/10 lines —
--     cleared_date pulled back. No net change (net already 50.05, correct).
--   Aug: missing a same-day internal wash (-1205/+1205, 8/1; +100/8/3 then
--     -100/8/4) and the Aug interest posting (+0.28, 8/31) — inserted.
--     -50.00 -> -49.72.
--
-- Food (x0806) Jul: missing the -80.00 (7/16) leg of the same-day wash whose
--   +80.00 inbound leg is already in the app (e9882b52) — inserted.
--   80.00 -> 0.00. Aug already exact, untouched.
--
-- Games (x0821) Jul: missing all 4 same-day outbound legs (-25/7/1, -5/7/2,
--   -20/7/15, -20/7/21) whose inbound legs are already in the app — inserted.
--   70.00 -> 0.00. Aug already exact, untouched.
--
-- kitten's playroom (x0820):
--   Jul: missing -5 (7/1), two same-day washes (+100/-100 x2 on 7/2 split as
--     100+10, not one 110 as the app's later Aug entries might suggest), a
--     +100/-100 wash (7/16), and the outbound leg of the existing +25 (dated
--     7/17 on the statement, not 7/18 — cleared_date corrected) — inserted /
--     fixed. 25.00 -> -5.00.
--   Aug: missing the -30.00 (8/30) outbound leg of the existing +30 (8/29,
--     "steph game and clothes") — inserted. 30.00 -> 0.00.
--
-- Pay Autosave (x0828) Aug: the "Autosave" row on 8/1 (3eedcbf2) is $30 but
--   the statement's 6th Aug-1 Pay-Autosave line is $5 (the app already has 5
--   separate +$5 rows that day) — corrected 30.00 -> 5.00. Missing the Aug
--   interest posting (+0.08, 8/31) — inserted. Also carries one leg of the
--   8/29 duplicate-$50-transfer cluster (see below) — deleted.
--
-- Steven's Savings (x0802, statement name "Savings") Jul: missing a second
--   -100.00 Internal Transfer Out on 7/2 (statement has two -100 lines that
--   day, app had one) and the -100.00 (distinct from the already-correct
--   -200.00) on 7/16 — inserted. 820.47 -> 620.47. Also carries one leg of
--   the 8/29 duplicate cluster (see below) — deleted.
--
-- 8/29 duplicate-$50-transfer cluster (Checking + Pay Autosave + Savings):
--   the app has FOUR "$50 Internal Transfer" pairs landing in Checking on
--   8/29 (from Pay Autosave x2, Savings x2), but Checking's own Aug 29
--   statement lines show only TWO +$50.00 "Internal Transfer In" entries, and
--   Pay Autosave's / Savings' own statement sections each show only ONE -$50
--   line that day. This slipped past the original Checking-only reconcile
--   because plain "Internal Transfer" lines carry no merchant text to dedupe
--   against. Two of the four pairs are exact duplicates — deleted (one pair
--   sourced from each pocket, arbitrarily by row since the app gives no way
--   to tell which specific insert was the dup): Pay Autosave's 3b2537fa +
--   Checking's 8ee9eb57 (group 38a0a951); Savings' 097217a4 + Checking's
--   13481539 (group 59703435). The surviving pair from each pocket (Pay
--   Autosave's 2c17708e/Checking's c3dd92b0; Savings' 024006f5/Checking's
--   f18e808d) is left untouched.
--
-- Net effect: all 6 active pockets now reconcile to their own OnePay
-- statement section net, both months, to the penny. Checking's Aug span
-- shifts by -100 (removing the 2 duplicate inflows) on top of the
-- 2026-09-11-one-checking-aaron-stash-fredmeyer-fix.sql changes — absorbed by
-- the existing 8/31 anchor as before. One Finance reconcile (Issue #61) is
-- now fully done.

begin;

-- Emergency ---------------------------------------------------------------

update public.transactions set cleared_date = '2026-07-10', transaction_date = '2026-07-10'
  where id = '9a65b3e0-a3d6-41f3-ba87-d5441b932e7c';  -- -20.00
update public.transactions set cleared_date = '2026-07-10', transaction_date = '2026-07-10'
  where id = '6495ee2d-6a61-4487-8331-2199633c63d3';  -- -30.00

insert into public.transactions
  (id, household_id, account_id, amount, status, transaction_date, cleared_date, description, institution_id)
values
  ('31a610d5-c942-42b1-9cd2-130fbd4e4ff9', 'cd8bce8c-81af-4302-8019-113e352ed443', 'da39073a-05fc-49aa-bca3-ba9b60c84b20', -1205.00, 'cleared', '2026-08-01', '2026-08-01', null, null),
  ('20f10e7c-33b3-4607-b6de-46614df8a3ec', 'cd8bce8c-81af-4302-8019-113e352ed443', 'da39073a-05fc-49aa-bca3-ba9b60c84b20', 1205.00, 'cleared', '2026-08-01', '2026-08-01', null, null),
  ('54bec562-1694-4c56-91ec-f00de2aa96f2', 'cd8bce8c-81af-4302-8019-113e352ed443', 'da39073a-05fc-49aa-bca3-ba9b60c84b20', 100.00, 'cleared', '2026-08-03', '2026-08-03', null, null),
  ('71e9e409-67e1-4d30-9fb8-12414482386f', 'cd8bce8c-81af-4302-8019-113e352ed443', 'da39073a-05fc-49aa-bca3-ba9b60c84b20', -100.00, 'cleared', '2026-08-04', '2026-08-04', null, null),
  ('9f62e7d8-0871-4cfd-8c1f-deabb224cff7', 'cd8bce8c-81af-4302-8019-113e352ed443', 'da39073a-05fc-49aa-bca3-ba9b60c84b20', 0.28, 'cleared', '2026-08-31', '2026-08-31', 'Interest', '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f');

update public.transactions set transfer_group_id = '65bafce3-d3a4-4098-8ce0-b58ce27cdac1'
  where id in ('31a610d5-c942-42b1-9cd2-130fbd4e4ff9', '20f10e7c-33b3-4607-b6de-46614df8a3ec');
update public.transactions set transfer_group_id = '140a0be1-ecbd-4b58-be13-b9212db1e776'
  where id in ('54bec562-1694-4c56-91ec-f00de2aa96f2', '71e9e409-67e1-4d30-9fb8-12414482386f');

-- Food ----------------------------------------------------------------------

insert into public.transactions
  (id, household_id, account_id, amount, status, transaction_date, cleared_date, description, institution_id)
values
  ('fafe736b-6c60-475a-bdb4-2e469070236f', 'cd8bce8c-81af-4302-8019-113e352ed443', 'bd68b0eb-62c4-4e46-bd01-36a7efc2d558', -80.00, 'cleared', '2026-07-16', '2026-07-16', null, null);

-- Games -----------------------------------------------------------------

insert into public.transactions
  (id, household_id, account_id, amount, status, transaction_date, cleared_date, description, institution_id)
values
  ('70ae97e1-72e4-4eb6-8b70-5425ae11d565', 'cd8bce8c-81af-4302-8019-113e352ed443', '1ee2c43e-eb43-44b0-92b6-3148ad193474', -25.00, 'cleared', '2026-07-01', '2026-07-01', null, null),
  ('181a256e-31c0-4dd1-bb79-1dad5ab2fa0e', 'cd8bce8c-81af-4302-8019-113e352ed443', '1ee2c43e-eb43-44b0-92b6-3148ad193474', -5.00, 'cleared', '2026-07-02', '2026-07-02', null, null),
  ('028258f4-f380-4ad9-8f7c-6d216467f639', 'cd8bce8c-81af-4302-8019-113e352ed443', '1ee2c43e-eb43-44b0-92b6-3148ad193474', -20.00, 'cleared', '2026-07-15', '2026-07-15', null, null),
  ('4c1ba0c5-418a-4cf5-92af-edb3f601b771', 'cd8bce8c-81af-4302-8019-113e352ed443', '1ee2c43e-eb43-44b0-92b6-3148ad193474', -20.00, 'cleared', '2026-07-21', '2026-07-21', null, null);

-- kitten's playroom -------------------------------------------------------

update public.transactions set cleared_date = '2026-07-17', transaction_date = '2026-07-17'
  where id = 'f61c5e2e-d9d0-4f62-8d64-dda006ce593b';  -- +25.00, was 7/18

insert into public.transactions
  (id, household_id, account_id, amount, status, transaction_date, cleared_date, description, institution_id)
values
  ('534bf623-5ed8-4ca3-ab39-a4268a7ed47e', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', -5.00, 'cleared', '2026-07-01', '2026-07-01', null, null),
  ('f023f521-2ca0-4593-a645-5056e2634f5f', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', 100.00, 'cleared', '2026-07-02', '2026-07-02', null, null),
  ('dd314daf-bae6-4181-88b2-177ddc8283b6', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', -100.00, 'cleared', '2026-07-02', '2026-07-02', null, null),
  ('efa8b485-5c76-4c13-97f5-9f7adea020e5', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', 10.00, 'cleared', '2026-07-02', '2026-07-02', null, null),
  ('726a046c-ed69-4b43-bdc5-be1016ecd8c3', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', -10.00, 'cleared', '2026-07-02', '2026-07-02', null, null),
  ('4e628032-3a7a-4909-9aa9-9026892f6e04', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', 100.00, 'cleared', '2026-07-16', '2026-07-16', null, null),
  ('dffbd12b-8bcf-4bc5-85e6-a7ae4f6fb2e6', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', -100.00, 'cleared', '2026-07-16', '2026-07-16', null, null),
  ('f97bbbd4-2c4a-4894-94d6-049a95caf515', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', -25.00, 'cleared', '2026-07-17', '2026-07-17', null, null),
  ('741b4736-3519-4d36-a53f-0f667a91fa34', 'cd8bce8c-81af-4302-8019-113e352ed443', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', -30.00, 'cleared', '2026-08-30', '2026-08-30', null, null);

update public.transactions set transfer_group_id = '21af72e0-6395-476e-a410-a80b3df1f5e9'
  where id in ('f023f521-2ca0-4593-a645-5056e2634f5f', 'dd314daf-bae6-4181-88b2-177ddc8283b6');
update public.transactions set transfer_group_id = 'd0ca5c83-d6c4-4d03-ba33-cd9adaacb7b1'
  where id in ('efa8b485-5c76-4c13-97f5-9f7adea020e5', '726a046c-ed69-4b43-bdc5-be1016ecd8c3');
update public.transactions set transfer_group_id = '0a885f3d-bf13-4478-abe2-c259ea1b6593'
  where id in ('4e628032-3a7a-4909-9aa9-9026892f6e04', 'dffbd12b-8bcf-4bc5-85e6-a7ae4f6fb2e6');

-- Pay Autosave --------------------------------------------------------------

update public.transactions set amount = 5.00
  where id = '3eedcbf2-2e9a-48eb-83dc-8fabc0fc252a';  -- was 30.00

insert into public.transactions
  (id, household_id, account_id, amount, status, transaction_date, cleared_date, description, institution_id)
values
  ('c2c8f7a1-4e7b-4b3a-9c5b-7e4f0a2d8b91', 'cd8bce8c-81af-4302-8019-113e352ed443', 'daeee338-c970-4c7c-8124-9ae55ee884dc', 0.08, 'cleared', '2026-08-31', '2026-08-31', 'Interest', '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f');

delete from public.transactions where id = '3b2537fa-db61-4eef-8ea1-54f409ec1c8d';  -- Pay Autosave -50.00 (dup)

-- Steven's Savings ------------------------------------------------------

insert into public.transactions
  (id, household_id, account_id, amount, status, transaction_date, cleared_date, description, institution_id)
values
  ('f3d2ac12-338e-4c1b-bced-1553e32bad5f', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', -100.00, 'cleared', '2026-07-02', '2026-07-02', null, null),
  ('18b8ee46-ceaf-4a62-9e26-ce1e439fa5fc', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', -100.00, 'cleared', '2026-07-16', '2026-07-16', null, null);

delete from public.transactions where id = '097217a4-ef6c-439b-91d6-d265b83ee823';  -- Steven's Savings -50.00 (dup)

-- Checking (Aug 29 duplicate-transfer cluster) -----------------------------

delete from public.transactions where id in (
  '8ee9eb57-46c5-4908-a2b0-8aeb196d4636',  -- +50.00 (paired with the deleted Pay Autosave -50)
  '13481539-f188-41d3-927a-441b69ea94aa'   -- +50.00 (paired with the deleted Savings -50)
);

commit;
