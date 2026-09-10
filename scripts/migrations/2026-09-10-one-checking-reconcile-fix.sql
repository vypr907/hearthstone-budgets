-- 2026-09-10 — One Checking (x0801) reconcile, follow-up fix.
-- Sibling of 2026-09-10-one-checking-reconcile.sql. Data-only. No schema change.
--
-- Resolves the four July items that 2026-09-10-one-checking-reconcile.sql left
-- for the user to identify (header note 2), plus two duplicate -$5.26 rows and
-- the two July charges the app had dated 8/1.
--
-- DECISIONS (from the user):
-- 1. USAA INSURANCE PAYMENT -$100 (7/2) — catch-up on an old cancelled AUTO
--    policy balance (missed payments -> policy cancelled -> paying off arrears).
--    Not the active "Auto Insurance" bill ($176.50/mo). Logged as a plain
--    Financial expense tagged to USAA.
-- 2. "Grant Repayment" kikoff01 -$76.42 (7/2) — repayment of a $75 Grant
--    cash advance + $1.42 fee. No Grant debt exists; logged as a split
--    ($75.00 principal + $1.42 fee, ADR-097 style) tagged to the Grant
--    institution.
-- 3. "Grant Subscription" kikoff01 -$9.99 (7/10) — Grant subscription fee
--    (since cancelled). Plain Financial expense tagged to Grant.
-- 4. STANDARD BOWCREDIT -$34.95 (7/13) — unwanted auto-signup, no tracked
--    payable. Plain Financial expense.
-- 5. Two -$5.26 rows are duplicates and are deleted:
--      124a0af7  7/20 Pokemon GO  — over-inserted by the main migration
--                                   (the 7/19 pre-existing rows already cover
--                                    both 7/20 statement lines);
--      b1f841f2  7/31 (Snapchat)  — from the 8/26 bad-import batch, no 7/31
--                                   statement line; dup of the 8/2 Snapchat.
-- 6. Aaron's Club -$11.08 (88fdee29) and KFC -$14.99 (7aa0c7ac) are dated 8/1
--    but the statement posts both 7/31 — cleared_date pulled back so they
--    bucket into July.
--
-- After this the July span is ~-$517 and August ~-$24. Once the 6 in-app
-- bill/debt marks (Issue #62) are done the July span lands near -$706 vs the
-- statement's -$712.96 (~$7 residual from small entry drift, absorbed by the
-- 7/31 + 8/31 balance anchors).

begin;

-- 1-4: the four identified July charges.
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, split_group_id, description, transaction_date, cleared_date)
values
  ('c3965437-1ce8-4e1d-925a-1247e49e5cbb', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -100.00, 'cleared', 'f6562ef9-ff93-43c7-a554-47fd204a6ded', '4893aa05-e6bd-4c45-afba-5dc74c1943af', null, 'USAA Auto insurance — arrears catch-up', '2026-07-02', '2026-07-02'),
  ('448ac9a8-ba63-4a47-ab6f-9c3e20d5cf77', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -75.00, 'cleared', 'f6562ef9-ff93-43c7-a554-47fd204a6ded', '83089ddd-3fa6-4ce5-807b-6fd841da8b5a', '137c4151-4aad-4677-b36f-315778f08082', 'Grant advance repayment', '2026-07-02', '2026-07-02'),
  ('f7c71e86-0021-4c0c-a5e1-eb5755e4fc88', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -1.42, 'cleared', 'be4f75e5-9ba0-4637-a790-ee9ce21bb83f', '83089ddd-3fa6-4ce5-807b-6fd841da8b5a', '137c4151-4aad-4677-b36f-315778f08082', 'Fee: Grant advance', '2026-07-02', '2026-07-02'),
  ('4167ed37-dc9f-44fb-8ed4-8cb5cd616f2d', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -9.99, 'cleared', 'f6562ef9-ff93-43c7-a554-47fd204a6ded', '83089ddd-3fa6-4ce5-807b-6fd841da8b5a', null, 'Grant subscription (cancelled)', '2026-07-10', '2026-07-10'),
  ('39521805-8e96-45b8-bb7c-993269b803b3', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -34.95, 'cleared', 'f6562ef9-ff93-43c7-a554-47fd204a6ded', null, null, 'Standard BowCredit (unwanted signup)', '2026-07-13', '2026-07-13');

-- 5: delete the two duplicate -$5.26 rows.
delete from public.transactions where id in (
  '124a0af7-1e18-47f9-897c-4a6d52b546fb',
  'b1f841f2-9525-4eab-b5e7-4dc8aee7d9f6');

-- 6: two July charges dated 8/1 -> pull cleared_date to their statement date.
update public.transactions set cleared_date = '2026-07-31'
  where id in ('88fdee29-a042-4f45-a0c2-b64b74791fad',  -- Bill payment · Aarons Club Mbrshp -11.08
               '7aa0c7ac-bb2c-4a80-9e43-d8c2030b569a'); -- KFC -14.99

commit;
