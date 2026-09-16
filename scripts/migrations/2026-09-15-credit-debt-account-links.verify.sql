-- Verify 2026-09-15-credit-debt-account-links.sql landed correctly.

-- 1. linked_account_id set on all 3, each pointing at the right account.
select d.id as debt_id, d.name, d.linked_account_id, a.name as account_name
from public.debts d
join public.accounts a on a.id = d.linked_account_id
where d.id in (
  '9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c',
  '31a11f8f-36c5-4d5d-9246-27ae60f669a5',
  '3cc9ddca-9aa8-4f65-804a-7ec95836a9f7'
);

-- 2. Each account's starting_balance matches the anchor math (expect
--    -268.00, -219.55, -1271.89).
select id, name, starting_balance from public.accounts
where id in (
  '4785cf79-7462-4f13-9bac-a5de6f253614',
  'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
  '2875d7b3-630b-4a14-82f1-3241db3c225e'
);

-- 3. GTC untouched (expect linked_account_id still null).
select id, name, linked_account_id from public.debts where name ilike '%gtc%';

-- 4. Sanity check the derived total by hand: starting_balance + every
--    cleared transaction on the account should equal the debt's
--    pre-migration remaining_balance (268.00 / 219.55 / the Mission Lane
--    assumption's 1318.01) once the app computes effectiveDebtBalance.
--    This just confirms no unexpected transactions exist yet on Milestone/
--    CreditOne (expect 0 rows each) -- Mission Lane keeps its known 2.
select account_id, count(*) from public.transactions
where account_id in (
  '4785cf79-7462-4f13-9bac-a5de6f253614',
  'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f',
  '2875d7b3-630b-4a14-82f1-3241db3c225e'
)
group by account_id;
