-- 2026-09-11 — One Checking (x0801): 3 confirmed gaps found cross-checking
-- the live OnePay "All transactions" feed (Sept 1-11) against the app, ahead
-- of a fuller September reconcile once the statement closes. Data-only, no
-- schema change, no ADR (matches the reconcile precedent used all session).
--
-- Verified by summing every line of the user-pasted OnePay feed
-- (planning/onepay_sept_feed — not committed, ephemeral) and diffing against
-- the ledger day by day; every other Sept 1-11 line matches exactly.
--
-- 1. Sunrise Bagel & Espresso -$16.00, Sept 2 — absent from the app entirely.
-- 2. OnePay Advance repayment fee -$6.75, Sept 9 — the app only had the
--    $225.00 principal leg (e63a2cfa); OnePay's feed shows the repayment as
--    one $231.75 line. Inserted unlinked (matches the 7/29 precedent where
--    the fee leg carries no linked_debt_id and never touches the debt).
-- 3. The $36.00 "Internal transfer (From Savings)" (ca8e53ee) is dated 9/3 in
--    the app; OnePay's feed puts it on 9/4 — date corrected.
--
-- UPDATE: pursued further — ruled out pending/hold activity (none shown),
-- wrong account (confirmed correct), "safe to spend" vs. raw balance
-- (user confirmed $13.14 IS the raw balance), future-dated or duplicate
-- transactions (none found), and split-group math errors (none found). The
-- user also hand-checked every visible transaction from 8/28 to today
-- against bank screenshots and found only 2 date-only corrections (already
-- fixed in-app, no dollar impact — both land on or before the 8/31 anchor
-- so don't move the current balance anyway).
--
-- The $65.26 gap survives all of that. Per user decision: anchor today
-- (9/11) at the real balance ($13.14) so the app is correct going forward,
-- and track the unexplained residual as GitHub Issue #64 to revisit once
-- the September statement closes and a full penny-for-penny reconcile
-- (like July/August) becomes possible.

begin;

insert into public.transactions
  (id, household_id, account_id, amount, status, transaction_date, cleared_date, description, institution_id)
values
  ('a6b9e2d4-9f1b-4c3a-8e7f-2d5c8a1b3f60', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -16.00, 'cleared', '2026-09-02', '2026-09-02', 'Sunrise Bagel & Espresso', '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f'),
  ('c1e4f7a2-6d3b-4a91-9c8e-5b7d0f2a4e13', 'cd8bce8c-81af-4302-8019-113e352ed443', '40124cdf-70bf-4923-8f1e-a7395a85e902', -6.75, 'cleared', '2026-09-09', '2026-09-09', 'Fee: OnePay Advance', '4f6021ea-85dc-4ede-88aa-98d37ca3ad6f');

update public.transactions set transaction_date = '2026-09-04', cleared_date = '2026-09-04'
  where id = 'ca8e53ee-e257-4949-b407-8d5afde759dc';  -- $36.00 transfer, was 9/3

insert into public.account_balances (id, account_id, balance, as_of_date)
values
  ('2dcb71ec-0f81-44de-a73c-9bec96215834', '40124cdf-70bf-4923-8f1e-a7395a85e902', 13.14, '2026-09-11');

commit;
