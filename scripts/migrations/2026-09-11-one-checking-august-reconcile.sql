-- 2026-09-11 — One Checking (x0801): line reconcile of August 2026 (Issue #61).
-- Data-only. No schema change. Follows 2026-09-10-one-checking-reconcile.sql
-- + -fix.sql (which fixed July in full and set the 7/31 + 8/31 anchors but
-- left August at ~-$24 vs the statement's -$56.42).
--
-- Full line-by-line pass over the 210 August Checking-section statement lines
-- vs the 213 app rows (planning/app-one-checking-aug.json snapshot +
-- planning/aug-reconcile.mjs). The user's ledger is heavily lump/split-entered;
-- entries that already cover a statement line (differently shaped) are left
-- alone. Net effect: -$24.17 -> ~-$57.1, within ~$0.7 of the statement.
--
-- FINDINGS / ACTIONS
--
-- Duplicates deleted:
--   1af8fc5d + c632bfe2  (8/6  round-up pair, -$1.00)  \
--   1324cd9d + 72847ae1  (8/7  round-up pair, -$0.50)   >  the 2026-09-10
--   386da7ec + b3f41562  (8/12 round-up pair, -$0.50)  /   migration re-added
--     round-ups the app already had from 8/17 (my reconciler mis-flagged them
--     "missing" because greedy matching consumed the originals).
--   ad8c6cdb  (-$36.67, 8/15 Amazon)   — dup of 4e7f654d (created 4 days later).
--   e70e0953  (-$29.75, 8/13 Stir It Up) — dup of ad38d004 (8/12, matches the
--             statement date).
--
-- Re-added (the 2026-09-10-...-fix.sql wrongly deleted b1f841f2 thinking it a
-- dup — it was the 8/2 Snapchat charge dated 7/31):
--   8/2  GOOGLE *Snapchat  -$5.26
--
-- Genuinely absent, inserted:
--   7x Sunrise Bagel & Espresso  (8/6 -7.50, 8/13 -8.50, 8/14 -16.00,
--     8/18 -15.25, 8/25 -16.00, 8/28 -16.00, 8/31 -8.50 = -$87.75)
--   Obligo INC  (8/10 +0.06, +0.07 ; 8/12 -0.06, -0.07 — net $0)
--   STANDARD BOWCREDIT  (8/12 -34.95 charge + 34.95 reversal — net $0; distinct
--     from the 7/13 BowCredit charge logged as an expense in -fix.sql)
--
-- Date fix:
--   a5bef86c  (-$8.38 Fred Meyer) is dated 7/31 but the statement posts it 8/1
--     — cleared_date pulled forward.
--
-- LEFT AS-IS (deliberately — user direction "keep my entries"):
--   - CreditOne -$60 (801707e4) and Snapchat -$5.26 (b650ebe9), both 8/31.
--     The user thought these posted in September, but the statement's August
--     total only reconciles with them IN August, so they stay. If they turn up
--     on the September statement, dedupe there.
--   - d7029670 (-$60.00, 8/30, Fred Meyer, no description) — no matching
--     statement line; left for the user to identify.
--   - The Aug 4 "Stash Financial Stash Subs -$12.00" statement line vs the
--     app's "-$3.00 Bill payment · Stash - Membership": a $9 gap. Left for the
--     user (bump the Stash bill amount if August's charge really was $12).
--   - The 8/21-22 Aaron's cluster (-434.03 / -97.10 / -9.20 / -39.46 vs the
--     statement's -$540.33): the pieces don't cleanly add up; left for the user.
--   - GTC -$1,381.13 / +$1,381.13 (8/13, 8/20) nets $0, not on the One
--     statement (ADR-070) — untouched.
--
-- After this: August span ~-$57.1 vs statement -$56.42 (~$0.7 residual from the
-- items left as-is, absorbed by the 8/31 anchor). The residual concentrates in
-- the Aaron's cluster + the Stash $9 + d7029670 — a handful of the user's own
-- entries, tracked back on #61.

begin;

-- Duplicates ------------------------------------------------------------
delete from public.transactions where id in (
  '1af8fc5d-6e4b-40b6-8e7e-c3031ab03bc0', 'c632bfe2-8fd3-4b71-8cda-4afa491a43c3',  -- 8/6  round-up pair
  '1324cd9d-eb9d-4d49-8a51-cb8f0d8756aa', '72847ae1-c7b7-4e31-8a08-11c056b7b095',  -- 8/7  round-up pair
  '386da7ec-2797-47cf-8713-e26d53dcb210', 'b3f41562-dfc9-4092-8b61-0fb65d35906a',  -- 8/12 round-up pair
  'ad8c6cdb-b242-4987-bd7c-bfbf3348e872',                                          -- 8/15 Amazon -36.67
  'e70e0953-dddf-455e-89b8-8d257a870121'                                           -- 8/13 Stir It Up -29.75
);

-- Date fix -------------------------------------------------------------
update public.transactions set cleared_date = '2026-08-01'
  where id = 'a5bef86c-d976-438e-9a0c-adfae0a5b96c';  -- Fred Meyer -8.38

-- Re-add + genuinely-absent purchases (cleared_date = transaction_date) --
insert into public.transactions
  (id, household_id, account_id, amount, status, category_id, institution_id, description, transaction_date, cleared_date)
values
  ('bd22c6bd-8080-4880-8781-820a8985cf02', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -5.26, 'cleared', '5aefc3f2-664b-4fb7-815d-d656175ddb5d', '8688a388-f413-4ad2-8559-6f2db62f60e5', 'Snapchat', '2026-08-02', '2026-08-02'),
  ('a95552f7-58a7-41f3-a9a7-e318c3c02cb4', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -7.50, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', 'Sunrise Bagel & Espresso', '2026-08-06', '2026-08-06'),
  ('b3abe3e4-9012-4182-a521-a056b89a9b3f', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -8.50, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', 'Sunrise Bagel & Espresso', '2026-08-13', '2026-08-13'),
  ('993265cc-9d15-4be3-bce3-092a612251aa', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -16.00, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', 'Sunrise Bagel & Espresso', '2026-08-14', '2026-08-14'),
  ('e439d532-e097-4e4b-9949-dfd9c9288842', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -15.25, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', 'Sunrise Bagel & Espresso', '2026-08-18', '2026-08-18'),
  ('9ee9cbc0-9979-4e05-8357-1eeacafecb6f', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -16.00, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', 'Sunrise Bagel & Espresso', '2026-08-25', '2026-08-25'),
  ('fa03383d-38fd-447a-97e0-09c5a1531e0e', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -16.00, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', 'Sunrise Bagel & Espresso', '2026-08-28', '2026-08-28'),
  ('214046e1-d906-49ae-9328-654444cc59ce', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -8.50, 'cleared', '55e48250-f140-4328-ab05-8dc028ecfe41', 'c926ff12-9b44-4ebf-a026-39121df9b5ab', 'Sunrise Bagel & Espresso', '2026-08-31', '2026-08-31'),
  ('9cf2f9e3-8803-4054-9501-4d71cfba6653', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 0.06, 'cleared', '0ab3cc0b-f576-4692-9eda-218106c760bc', null, 'Obligo INC', '2026-08-10', '2026-08-10'),
  ('aabb2a50-defd-47b1-9a8f-4582fbf249cd', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 0.07, 'cleared', '0ab3cc0b-f576-4692-9eda-218106c760bc', null, 'Obligo INC', '2026-08-10', '2026-08-10'),
  ('51d18f17-f6e5-4d8c-b211-0a9d9784ce80', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -0.06, 'cleared', '0ab3cc0b-f576-4692-9eda-218106c760bc', null, 'Obligo INC', '2026-08-12', '2026-08-12'),
  ('acf9648c-f1a7-44ba-83a1-3d720d1c8c83', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -0.07, 'cleared', '0ab3cc0b-f576-4692-9eda-218106c760bc', null, 'Obligo INC', '2026-08-12', '2026-08-12'),
  ('ca3ae498-db8a-490b-92db-43950659c739', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -34.95, 'cleared', 'f6562ef9-ff93-43c7-a554-47fd204a6ded', null, 'Standard BowCredit', '2026-08-12', '2026-08-12'),
  ('9def87ed-e709-49c1-9035-cc1433a6374c', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', 34.95, 'cleared', 'f6562ef9-ff93-43c7-a554-47fd204a6ded', null, 'Standard BowCredit (reversal)', '2026-08-12', '2026-08-12');

commit;
