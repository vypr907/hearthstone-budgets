-- 2026-09-10 — Reconcile "One Checking - Steven" (OnePay pocket x0801,
-- 40124cdf-...) against its July + August 2026 OnePay PDF statements
-- (planning/2026-07.pdf, planning/2026-08.pdf; Checking-section lines
-- transcribed to planning/one-checking-statement.csv, both months tie to
-- the printed TOTAL — Jul -$712.96, Aug -$56.42). Data-only. No schema change.
--
-- Built with scripts/reconcile-one-csv.mjs + planning/gen-one-migration.mjs.
-- Statement: 312 Checking lines. App before this: 39 July rows (nothing
-- before Jul 17), 207 August rows. July net was -$129.75 vs -$712.96;
-- August -$28.04 vs -$56.42.
--
-- INTERVIEW DECISIONS
-- 1. Transfer / round-up legs: paired transfer_group_id rows into the REAL
--    One pocket (cross-referenced against the 24 pocket statement pages).
--    The Jul 2 +$100 into checking was ambiguous (Steven's Savings vs
--    kitten's playroom) — user chose Steven's Savings. Stash "STASH CAPITAL
--    (S" transfers modelled as legs into Personal Portfolio, matching the
--    existing August rows.
-- 2. Bill/debt-linked July items are NOT inserted here — user will mark
--    each paid in the Bills/Debts screens so cycle counters stay correct
--    (the USAA/GCI precedent). Checklist:
--      07-02  -76.42  Kikoff  "Grant Repayment"        (bill 80600c6a)
--      07-10   -9.99  Kikoff  "Grant Subscription"     (bill 80600c6a)
--      07-02  -16.12  Amazon Web Services              (bill a18b51a1)
--      07-02 -100.00  USAA insurance payment           (bill 9b8ab68b Auto Insurance — confirm which policy)
--      07-03  -11.08  Aaron's                          (bill 26d9208d Aarons Club Mbrshp)
--      07-04  -30.00  Providence                       (debt f4a918bf Providence Alaska)
--      07-07  -88.39  Beiers Midway Storage            (bill abc22035 Beiers Storage)
--      07-03   -3.00  Stash Financial Stash Subs       (bill a2647fc6 Stash - Membership)
--      07-17  -40.00  Cleo AI CASHADVNCE               (debt 085f2811 Cleo — advance repayment)
--      07-13  -34.95  STANDARD BOWCREDIT               (unclassified — categorise/confirm)
--    Two more July statement charges are IN the app but dated 8/1
--    (statement posts them 7/31): Aaron's Club -$11.08 (88fdee29) and
--    KFC -$14.99 (7aa0c7ac). Left where they are — harmless date drift.
--    Net: after this migration the July span nets ~-$281; once the ~$410
--    of flagged items are marked in-app it reaches ~-$690. The remaining
--    ~$22 gap to -$712.96 is those two 8/1-dated charges (~$26) net of a
--    small round-up over-insert. The 7/31 + 8/31 anchors keep the
--    displayed and month-end balances exact meanwhile.
-- 3. August is ~97% entered and heavily lump/split-entered by the user, so
--    it is NOT reconciled line-for-line (user direction: keep app rows,
--    don't re-itemize). Applied: 5 of the 6 MoneyLion-triggered $5
--    autosaves, 3 round-ups, and the DoubleWood amount/date fix.
--    Lump/split app rows that cover several statement lines are LEFT AS-IS
--    and those lines NOT inserted:
--      app -37.28 = stmt -29.41 + -7.87 ;  app -35.66 = -26.93 + -8.73
--      app -52.72 = -42.57 + -10.15      ;  app -27.06 = -21.76 + -5.30
--      app Aug-23 Fred Meyer 4-way split = the Aug-24 -$59.79 trip
--      6x MoneyLion +$100 = the one +$600 "Advance: Instacash" already logged
--    The GTC -$1,381.13 / +$1,381.13 (8/13, 8/20) pair nets zero and is
--    not on the One statement — left untouched (ADR-070).
--    KNOWN August items NOT actioned here (a full line pass is a follow-up
--    Issue — doing them piecemeal unbalances the month):
--      - ~7 Sunrise Bagel charges (~-$87.75) appear absent, but ~$45 of
--        that spend is already inside the user's lump rows, so inserting
--        all 7 overshoots;
--      - ad8c6cdb (-$36.67, 8/15 Amazon) is a duplicate of 4e7f654d;
--      - 801707e4 (-$60 CreditOne) and b650ebe9 (-$5.26 Snapchat), dated
--        8/31, per the user posted in September — will show on the Sept
--        statement;
--      - Aaron's Club -$11.08 (88fdee29) and KFC -$14.99 (7aa0c7ac) are
--        dated 8/1 but the statement posts them 7/31.
--    After this the August span nets ~-$50 vs the statement's -$56.42; the
--    ~$6 residual is absorbed by the 8/31 balance anchor.
-- 4. OnePay Advance debt: the July cycle (Jul 2 +$225 advance, Jul 8 -$27.39
--    + Jul 15 -$204.36 repayments) nets to $0 within July and both
--    month-end x0833 balances are $0, so debts.remaining_balance ($0.00) is
--    already correct — no debt update needed. Confirm the OnePay Advance
--    screen still reads $0 after this runs.
-- 5. Corrections to existing rows: see UPDATE block.
-- 6. Balance anchors: One Checking gets 7/31 ($100.12) and 8/31 ($43.70);
--    each pocket touched by a new leg gets an 8/31 anchor at its statement
--    ending balance so its displayed balance is correct after we perturb it.
--    A full statement reconcile of the 24 pockets is out of scope (Issue).

begin;

-- Corrections to existing rows -------------------------------------------
-- Jul-30 ASRC paycheck -> its statement post date 7/29 (cleared_date only;
-- ADR-100 — transaction_date left as the day it was marked received).
update public.transactions set cleared_date = '2026-07-29'
  where id = '84b331a9-1a23-4745-9d2c-acb1d1c9c654';

-- DoubleWood: app row is the Aug 1 statement charge, wrong amount + date.
update public.transactions set amount = -11.16, transaction_date = '2026-08-01', cleared_date = '2026-08-01'
  where id = '2c010d5b-bc37-4012-a747-3d9c6a7b98fa';

-- Duplicate (later-created copy of a real row) — delete.
--   6713eac2  -$35.67 dated 7/31, Uber Eats — dup of f8d5b31d (Aug 1, real);
--             the statement has only one -$35.67 Uber (Aug 1).
delete from public.transactions where id = '6713eac2-b2fd-455b-b76b-be33108461dd';

-- Plain One Checking additions (cleared_date = transaction_date, ADR-100) --
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, linked_debt_id, description, transaction_date, cleared_date)
values
  ('7d94a79a-cd68-401a-8374-ec2b746e229b', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.65, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'e97eb306-7063-4fc9-99b8-060ce76b7ce3', null, 'Wendy''s', '2026-07-01', '2026-07-01'),
  ('23243373-e3a2-4cbb-8053-0f529ed81734', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -164.50, 'cleared', '9f744387-56ee-4d42-a5b2-59afda81f3eb', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', null, 'Fred Meyer', '2026-07-02', '2026-07-02'),
  ('84374865-f062-4f20-8e9e-e36ef3bf1a82', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -13.49, 'cleared', '8d2d98a2-bc3b-48bd-af33-4582c67aa042', 'b733b2dd-208d-4b81-a541-4a6b9d060faf', null, 'Petco', '2026-07-02', '2026-07-02'),
  ('8b9dacae-945d-4616-8142-e053cc873687', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -23.42, 'cleared', '9f744387-56ee-4d42-a5b2-59afda81f3eb', '10da1df2-73fb-4697-ab47-272195075679', null, 'Safeway', '2026-07-02', '2026-07-02'),
  ('f4fbd203-d876-4056-823f-7ce19f6b47bc', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -16.00, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', null, 'Sunrise Bagel & Espresso', '2026-07-02', '2026-07-02'),
  ('5d92c69d-b68f-494d-8a69-5b1e083c5c8b', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -52.11, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'd8f0d0f6-7e50-47c6-82de-8051effedd11', null, 'Uber Eats', '2026-07-02', '2026-07-02'),
  ('42abaea3-10f0-404f-84bb-aa2c7d7a705f', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -40.00, 'cleared', '92810d6e-371e-458d-94c7-7cb53539188d', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', null, 'ATM withdrawal (Nature''s Releaf)', '2026-07-02', '2026-07-02'),
  ('238c8495-3362-428a-870d-1028fcb7737f', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -20.00, 'cleared', '92810d6e-371e-458d-94c7-7cb53539188d', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', null, 'ATM withdrawal (Nature''s Releaf)', '2026-07-02', '2026-07-02'),
  ('27919100-3c1c-496c-8f3d-f47ab67c5936', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -3.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f', null, 'ATM PIN Fee', '2026-07-02', '2026-07-02'),
  ('906421f0-5524-48dd-8092-153df6db4bed', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -3.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f', null, 'ONE ATM Fee', '2026-07-02', '2026-07-02'),
  ('73db5125-de24-4fb4-83e8-9814c6e1b126', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -3.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f', null, 'ATM PIN Fee', '2026-07-02', '2026-07-02'),
  ('07ac9ede-b611-4bd0-89f5-d4d94d443040', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -3.00, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f', null, 'ONE ATM Fee', '2026-07-02', '2026-07-02'),
  ('d3906142-e34c-49b1-8075-cf59bf27530a', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -27.98, 'cleared', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', null, 'LW General Store (Nature''s Releaf)', '2026-07-03', '2026-07-03'),
  ('8db23b7e-52c3-4ea1-888d-fb07012bf0c8', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -60.00, 'cleared', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', null, 'Fred M Fuel', '2026-07-03', '2026-07-03'),
  ('81fa1ae4-95ab-466c-806d-c7bf81a0b830', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.26, 'cleared', '5aefc3f2-664b-4fb7-815d-d656175ddb5d', '8688a388-f413-4ad2-8559-6f2db62f60e5', null, 'Snapchat', '2026-07-03', '2026-07-03'),
  ('72e4c921-9f7d-45b9-802c-3370c41e2d2c', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -9.47, 'cleared', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', null, 'LW General Store (Nature''s Releaf)', '2026-07-03', '2026-07-03'),
  ('95bbcbe2-5e69-4464-895c-60c90024fc55', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -10.00, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'ba9a8635-762a-43de-86ee-5b33775bb5d9', null, 'Starbucks', '2026-07-04', '2026-07-04'),
  ('35c0d059-84b5-4618-8de8-b5123f9c44e7', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -29.92, 'cleared', '9f744387-56ee-4d42-a5b2-59afda81f3eb', '85e88a17-bd0a-4a5f-8967-0c86cfa39c7c', null, 'Walmart', '2026-07-04', '2026-07-04'),
  ('4eb45663-e57b-4522-83f8-2cd9c0ae6357', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -8.50, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', null, 'Sunrise Bagel & Espresso', '2026-07-04', '2026-07-04'),
  ('736cb33e-bf86-42c5-88d6-a26d66d9c0dd', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -10.00, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'ba9a8635-762a-43de-86ee-5b33775bb5d9', null, 'Starbucks', '2026-07-05', '2026-07-05'),
  ('881c115e-2602-4026-8661-de57265be3c2', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -7.75, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', null, 'Sunrise Bagel & Espresso', '2026-07-05', '2026-07-05'),
  ('3027ec62-8420-42e2-8ce7-6fbdacea45ec', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -15.99, 'cleared', '708cce35-a411-4d48-a873-4e9dd48536ed', 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4', null, 'LW General Store (Nature''s Releaf)', '2026-07-05', '2026-07-05'),
  ('3de66c67-3b0a-4d50-84a7-c5d937ed6e2f', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -40.00, 'cleared', '0f63e7bb-7c8b-457a-87c0-28756dc62995', 'c166c7bd-4b67-4eb2-90ab-0854acca957d', null, 'Fred M Fuel', '2026-07-06', '2026-07-06'),
  ('c0201c0f-840b-4979-82b6-b3956d61258b', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -2.10, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', null, 'Pixel Flow', '2026-07-06', '2026-07-06'),
  ('86fdb881-37a0-4f81-8016-fa11ae3e346a', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -9.48, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', null, null, 'Google *UGO Games', '2026-07-07', '2026-07-07'),
  ('e508eaa7-37fc-4a08-839c-8d966dc3f8ad', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -10.54, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', null, null, 'Google *UGO Games', '2026-07-08', '2026-07-08'),
  ('9268f437-cb5a-4318-879d-09c6989e84a3', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 27.39, 'cleared', '9dc46f8f-0a4b-4d3c-a5c3-8f41902b7903', null, null, 'FreeFunder payout', '2026-07-08', '2026-07-08'),
  ('0e91c1f3-1b47-46e7-8402-e67e86572378', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -2.10, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', null, 'Pixel Flow', '2026-07-11', '2026-07-11'),
  ('ecd66b9f-cbc5-4bd2-8f62-5b4623e34ef9', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -2.10, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', 'deba8862-aa51-4481-a8fb-5cbfd246423e', null, 'Pixel Flow', '2026-07-12', '2026-07-12'),
  ('73b28453-7a5e-4a19-8ba0-a400f34f9362', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -0.01, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '32ddce8d-df53-4de5-aadc-7818079f10da', null, 'Cleo AI account verify', '2026-07-13', '2026-07-13'),
  ('4da6a79b-86c5-4c3d-84cf-1781728ee577', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -21.09, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', '038a2a5a-aa70-439b-a120-13e302a7b7c4', null, 'Pokemon GO', '2026-07-13', '2026-07-13'),
  ('eaca292a-132a-4d1d-8bac-3c44aa99855b', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -7.37, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', '038a2a5a-aa70-439b-a120-13e302a7b7c4', null, 'Pokemon GO', '2026-07-16', '2026-07-16'),
  ('a1d61366-92d5-4ca7-8989-bcecb8662119', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.26, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', '038a2a5a-aa70-439b-a120-13e302a7b7c4', null, 'Pokemon GO', '2026-07-20', '2026-07-20'),
  ('124a0af7-1e18-47f9-897c-4a6d52b546fb', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.26, 'cleared', '2707019e-b66a-44fd-ab30-2e87e36bccd1', '038a2a5a-aa70-439b-a120-13e302a7b7c4', null, 'Pokemon GO', '2026-07-20', '2026-07-20'),
  ('5744cc8c-d7e1-415c-82c1-62a250c9de3b', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 1300.00, 'cleared', null, '850f28b0-d705-47cf-aeb6-b2db115389e7', null, 'Paycheck: ASRC Federal', '2026-07-15', '2026-07-15'),
  ('c6d4326f-297f-45a7-8915-a3f077d94471', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -27.39, 'cleared', null, '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f', 'a1581069-a274-4ef5-91a5-690943fed672', 'Debt payment · OnePay Advance', '2026-07-08', '2026-07-08'),
  ('c609a240-fdde-4cb8-8a32-f13b42a8a654', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -204.36, 'cleared', null, '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f', 'a1581069-a274-4ef5-91a5-690943fed672', 'Debt payment · OnePay Advance', '2026-07-15', '2026-07-15');

-- OnePay Advance draw, 7/2 (mirrors the existing 7/17 "Advance:" row:
-- single-row transfer group, linked_debt_id set).
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, linked_debt_id, description, transaction_date, cleared_date)
values
  ('7ca3aca2-b8c0-4507-888c-217406a46857', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 225.00, 'cleared', '5735d7cd-5776-4f0d-8e98-c395d861249c', 'a1581069-a274-4ef5-91a5-690943fed672', 'Advance: OnePay Advance', '2026-07-02', '2026-07-02');

-- Internal transfer / round-up pairs (ADR-056; descriptions null so the
-- title auto-renders "Source -> Destination" per ADR-098). Round-up legs
-- carry description 'Round-up' to match existing rows.
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('b91a3b5e-985a-4688-86a9-2ea5782ba02f', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -0.52, 'cleared', '330f7993-5dd4-40c1-8961-0dc440aafc97', 'Round-up', '2026-07-01', '2026-07-01'),
  ('87db900f-fdac-4e58-8a30-034d0ca109bf', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 0.52, 'cleared', '330f7993-5dd4-40c1-8961-0dc440aafc97', 'Round-up', '2026-07-01', '2026-07-01');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('25d799c7-2a18-434e-8b11-9df3b56382f9', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -50.00, 'cleared', 'b6949334-a799-4572-810c-7f9b7cf6e0b3', null, '2026-07-01', '2026-07-01'),
  ('00bf35ff-3720-464b-8987-1f64deb94bd2', 'cd8bce8c-81af-4302-8019-113e352ed443', 'da39073a-05fc-49aa-bca3-ba9b60c84b20', 50.00, 'cleared', 'b6949334-a799-4572-810c-7f9b7cf6e0b3', null, '2026-07-01', '2026-07-01');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('5167c493-7a96-4407-8458-ad5f98b9bda2', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -300.00, 'cleared', '3527b3af-02b3-4676-87dd-bbc7e811495d', null, '2026-07-01', '2026-07-01'),
  ('42612aa3-5ac4-453e-885f-50410bb3276f', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 300.00, 'cleared', '3527b3af-02b3-4676-87dd-bbc7e811495d', null, '2026-07-01', '2026-07-01');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('3a2e4ff8-37bf-47a2-82b5-ed06d7d5a217', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -25.00, 'cleared', '17fe19f4-9694-4d4e-80c1-bd59fd207239', null, '2026-07-01', '2026-07-01'),
  ('19e4fa58-22d9-4a42-8114-a8740285a193', 'cd8bce8c-81af-4302-8019-113e352ed443', '1ee2c43e-eb43-44b0-92b6-3148ad193474', 25.00, 'cleared', '17fe19f4-9694-4d4e-80c1-bd59fd207239', null, '2026-07-01', '2026-07-01');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('df5f17cf-2f0c-4c7b-838f-0b2ef853cf7a', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 65.00, 'cleared', '1de54009-bbb2-4448-8e15-1acb75b38f70', null, '2026-07-02', '2026-07-02'),
  ('038019ca-2d0c-4233-8292-9694752924c0', 'cd8bce8c-81af-4302-8019-113e352ed443', 'daeee338-c970-4c7c-8124-9ae55ee884dc', -65.00, 'cleared', '1de54009-bbb2-4448-8e15-1acb75b38f70', null, '2026-07-02', '2026-07-02');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('0e3be38b-9704-473e-85f7-97d213243fe9', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 100.00, 'cleared', 'f9cdfaa0-6a8e-49d0-8dbc-5b28800f0b20', null, '2026-07-02', '2026-07-02'),
  ('e071bcb3-fd07-48ac-8b8f-c5bb886af37a', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', -100.00, 'cleared', 'f9cdfaa0-6a8e-49d0-8dbc-5b28800f0b20', null, '2026-07-02', '2026-07-02');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('569ac4e3-7acc-4a21-8020-749ccfcdc648', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.00, 'cleared', '83211297-776b-4d1a-89fe-cfc00cfe0f94', null, '2026-07-02', '2026-07-02'),
  ('38ec95e4-717c-43ea-8589-56e56ce543c0', 'cd8bce8c-81af-4302-8019-113e352ed443', '1ee2c43e-eb43-44b0-92b6-3148ad193474', 5.00, 'cleared', '83211297-776b-4d1a-89fe-cfc00cfe0f94', null, '2026-07-02', '2026-07-02');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('aa200d73-453e-4db1-8ed9-88e207ff3755', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.36, 'cleared', '6a1b550b-f662-4345-85f0-dbb135ee5082', 'Round-up', '2026-07-03', '2026-07-03'),
  ('c6f80dd5-ce1e-42cf-8758-385c954d1043', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 5.36, 'cleared', '6a1b550b-f662-4345-85f0-dbb135ee5082', 'Round-up', '2026-07-03', '2026-07-03');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('5a926fe6-a877-4eaf-8fb5-99078479dfa1', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -3.56, 'cleared', '294d1e3d-4aec-40fb-8a5e-8ed9114717df', 'Round-up', '2026-07-04', '2026-07-04'),
  ('9b4b2809-44c8-4307-8e11-b1a8127fc54b', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 3.56, 'cleared', '294d1e3d-4aec-40fb-8a5e-8ed9114717df', 'Round-up', '2026-07-04', '2026-07-04');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('0405bdd2-23aa-4c6b-8a1c-6b6f2ddceb2d', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 20.00, 'cleared', 'e6e4c782-648f-4be8-8bb0-445559b98164', null, '2026-07-04', '2026-07-04'),
  ('37f8a09e-89b6-481f-80c9-a8b674f283be', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', -20.00, 'cleared', 'e6e4c782-648f-4be8-8bb0-445559b98164', null, '2026-07-04', '2026-07-04');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('f96c6a69-0bca-44a7-8b61-3169f0a29cb4', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 88.95, 'cleared', 'ff58e39b-1711-4b85-847c-4e2fdd9ed308', null, '2026-07-06', '2026-07-06'),
  ('de83f9ab-be58-45fe-8213-563c973c60c1', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', -88.95, 'cleared', 'ff58e39b-1711-4b85-847c-4e2fdd9ed308', null, '2026-07-06', '2026-07-06');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('2c6f8647-4bbb-4462-8db8-9e5b884a9ba3', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.00, 'cleared', '3ca78481-9b50-4223-8c2e-13fb47264f9d', null, '2026-07-10', '2026-07-10'),
  ('9c3f21d4-57e9-4abb-8eea-79d492540c05', 'cd8bce8c-81af-4302-8019-113e352ed443', '28d65857-d2ab-4606-917b-6821c8f15f1d', 5.00, 'cleared', '3ca78481-9b50-4223-8c2e-13fb47264f9d', null, '2026-07-10', '2026-07-10');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('8a66b347-211b-4238-8baa-5a569cafc678', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -49.30, 'cleared', '4dd565cd-48c4-4a10-81d4-d8709fd85564', null, '2026-07-15', '2026-07-15'),
  ('65a245e7-be6b-434d-8a81-1aabc8a30a6c', 'cd8bce8c-81af-4302-8019-113e352ed443', 'daeee338-c970-4c7c-8124-9ae55ee884dc', 49.30, 'cleared', '4dd565cd-48c4-4a10-81d4-d8709fd85564', null, '2026-07-15', '2026-07-15');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('364dcb1f-561f-4540-88b1-e979102e5e18', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -800.00, 'cleared', '7d24c56b-87a4-4434-81b8-6234e232c2bb', null, '2026-07-15', '2026-07-15'),
  ('c93db00f-f3ec-40cc-8cb2-e2924699949a', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 800.00, 'cleared', '7d24c56b-87a4-4434-81b8-6234e232c2bb', null, '2026-07-15', '2026-07-15');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('1255093f-3fa5-4e1e-8a7b-1115d70d1e5b', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -20.00, 'cleared', '9c712634-0ad0-40ae-8043-4ca8244f838c', null, '2026-07-15', '2026-07-15'),
  ('687a59f6-1051-4f8f-8b9b-e8116240b065', 'cd8bce8c-81af-4302-8019-113e352ed443', '1ee2c43e-eb43-44b0-92b6-3148ad193474', 20.00, 'cleared', '9c712634-0ad0-40ae-8043-4ca8244f838c', null, '2026-07-15', '2026-07-15');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('7f2df393-0c77-4e53-8f81-87fdf3f19d23', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -80.00, 'cleared', 'e03ca630-fc7f-447e-8992-6e828806d9c1', null, '2026-07-16', '2026-07-16'),
  ('e9882b52-3347-4009-8070-370f6150edf5', 'cd8bce8c-81af-4302-8019-113e352ed443', 'bd68b0eb-62c4-4e46-bd01-36a7efc2d558', 80.00, 'cleared', 'e03ca630-fc7f-447e-8992-6e828806d9c1', null, '2026-07-16', '2026-07-16');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('82482bdf-dd4f-4d2f-80f2-80a68ef1c255', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 200.00, 'cleared', 'b682c5cb-c3e9-4377-8468-501d495bb172', null, '2026-07-16', '2026-07-16'),
  ('d14b8d47-778b-4df6-8539-4aa38dbec58b', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', -200.00, 'cleared', 'b682c5cb-c3e9-4377-8468-501d495bb172', null, '2026-07-16', '2026-07-16');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('1af8fc5d-6e4b-40b6-8e7e-c3031ab03bc0', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -1.00, 'cleared', '28da0629-e76d-4143-8cd5-52b82ebbf557', 'Round-up', '2026-08-06', '2026-08-06'),
  ('c632bfe2-8fd3-4b71-8cda-4afa491a43c3', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 1.00, 'cleared', '28da0629-e76d-4143-8cd5-52b82ebbf557', 'Round-up', '2026-08-06', '2026-08-06');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('1324cd9d-eb9d-4d49-8a51-cb8f0d8756aa', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -0.50, 'cleared', '316fdbc2-ce25-487f-86fd-8524e209e708', 'Round-up', '2026-08-07', '2026-08-07'),
  ('72847ae1-c7b7-4e31-8a08-11c056b7b095', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 0.50, 'cleared', '316fdbc2-ce25-487f-86fd-8524e209e708', 'Round-up', '2026-08-07', '2026-08-07');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('386da7ec-2797-47cf-8713-e26d53dcb210', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -0.50, 'cleared', '5d35d737-65ef-4ecf-8c3d-09c9b8184efc', 'Round-up', '2026-08-12', '2026-08-12'),
  ('b3f41562-dfc9-4092-8b61-0fb65d35906a', 'cd8bce8c-81af-4302-8019-113e352ed443', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 0.50, 'cleared', '5d35d737-65ef-4ecf-8c3d-09c9b8184efc', 'Round-up', '2026-08-12', '2026-08-12');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('3d614cd9-2270-4716-83c6-29fd113eaaa7', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.00, 'cleared', '9f55c607-a679-440a-8759-03783c27ac0c', null, '2026-08-01', '2026-08-01'),
  ('cdc9f799-f142-45e0-84b3-a1ecf495f7f3', 'cd8bce8c-81af-4302-8019-113e352ed443', 'daeee338-c970-4c7c-8124-9ae55ee884dc', 5.00, 'cleared', '9f55c607-a679-440a-8759-03783c27ac0c', null, '2026-08-01', '2026-08-01');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('23c839ea-7afe-4472-81f8-9d2d00406f32', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.00, 'cleared', 'f1afab2a-3da2-433f-89f4-d7f15ad7d284', null, '2026-08-01', '2026-08-01'),
  ('dc85c5c7-158d-484c-8b84-f2a41efdd8c5', 'cd8bce8c-81af-4302-8019-113e352ed443', 'daeee338-c970-4c7c-8124-9ae55ee884dc', 5.00, 'cleared', 'f1afab2a-3da2-433f-89f4-d7f15ad7d284', null, '2026-08-01', '2026-08-01');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('77e400fc-fbe6-495f-8a65-cc43033a7fee', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.00, 'cleared', '5714395d-9466-4e58-8520-2b085f5660d8', null, '2026-08-01', '2026-08-01'),
  ('249ef6ec-a96e-471b-80f6-478c52f905a1', 'cd8bce8c-81af-4302-8019-113e352ed443', 'daeee338-c970-4c7c-8124-9ae55ee884dc', 5.00, 'cleared', '5714395d-9466-4e58-8520-2b085f5660d8', null, '2026-08-01', '2026-08-01');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('81090bab-e463-4ecb-8631-b7a144759ef1', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.00, 'cleared', 'cdd34ffa-eef0-440b-8ebd-7afca2e086c6', null, '2026-08-01', '2026-08-01'),
  ('af0ef2aa-cae1-41f5-8477-2058795d6b1c', 'cd8bce8c-81af-4302-8019-113e352ed443', 'daeee338-c970-4c7c-8124-9ae55ee884dc', 5.00, 'cleared', 'cdd34ffa-eef0-440b-8ebd-7afca2e086c6', null, '2026-08-01', '2026-08-01');
insert into public.transactions
  (id, household_id, account_id, amount, status, transfer_group_id, description, transaction_date, cleared_date)
values
  ('32a5abf0-fbee-4c50-8ed6-b134172eff29', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.00, 'cleared', '3b7eb2d5-de94-47d2-855b-6c136c647946', null, '2026-08-01', '2026-08-01'),
  ('b0770886-352c-4211-80f5-db9b1ea7765c', 'cd8bce8c-81af-4302-8019-113e352ed443', 'daeee338-c970-4c7c-8124-9ae55ee884dc', 5.00, 'cleared', '3b7eb2d5-de94-47d2-855b-6c136c647946', null, '2026-08-01', '2026-08-01');

-- Balance anchors -------------------------------------------------------
-- (statement ending balances; latest as_of_date wins for "current")
--   One Checking - Steven 2026-07-31  $100.12
--   One Checking - Steven 2026-08-31  $43.70
--   Steven's Savings     2026-08-31  $185.31
--   Emergency            2026-08-31  $0.33
--   Food                 2026-08-31  $0.13
--   Games                2026-08-31  $0.00
--   kitten's playroom    2026-08-31  $0.01
--   Pay Autosave         2026-08-31  $0.19
insert into public.account_balances (id, account_id, balance, as_of_date)
values
  ('d2dfa982-1482-4e1c-872c-9e7eb9d8b994', '40124cdf-70bf-4923-8f1e-a7395a85e902', 100.12, '2026-07-31'),
  ('06b982c0-4fbc-4e2d-8940-87a58ead0137', '40124cdf-70bf-4923-8f1e-a7395a85e902', 43.70, '2026-08-31'),
  ('f9ce4312-8bf5-499f-818a-65c617aa3971', '6698cc8a-db5d-4937-9213-7b77fd3e4556', 185.31, '2026-08-31'),
  ('2f411f2b-cd2d-419a-8dd4-15bb4f3d2908', 'da39073a-05fc-49aa-bca3-ba9b60c84b20', 0.33, '2026-08-31'),
  ('29b11382-a460-46ff-8c4c-ad5d1d6d4719', 'bd68b0eb-62c4-4e46-bd01-36a7efc2d558', 0.13, '2026-08-31'),
  ('907d7121-5139-4c57-8942-e0ba791b0e48', '1ee2c43e-eb43-44b0-92b6-3148ad193474', 0.00, '2026-08-31'),
  ('bd2cf3fa-0652-45dd-879e-8a3c54b73b80', '499eef21-f29e-491b-96c1-0f7e3b4bf4f0', 0.01, '2026-08-31'),
  ('fa3d7f09-3af1-4c12-8e3a-5dd1d574ef17', 'daeee338-c970-4c7c-8124-9ae55ee884dc', 0.19, '2026-08-31');

commit;
