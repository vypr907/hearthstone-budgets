-- Verify 2026-11-04-dispensary-atm-fee-place-fix.sql landed correctly.

-- 1. Pattern A: all 4 should now show institution_id = Venmo.
select id, transaction_date, amount, description, institution_id
from public.transactions
where id in (
  '0b8ff55c-1197-44c4-ab18-0557191b906e', '89f33d50-145e-4b68-87fc-56e7d7c406d6',
  'dfab719d-2337-4343-95de-aecfef082b64', '7eae8d72-bf06-4d7f-8aaa-1cfc8d0a8af6'
);
-- expect: all institution_id = 'edf5c0ca-f45b-4709-b159-053977f32903'

-- 2. Pattern B: each of the 8 original rows should now read -3.00 with a
-- real description; each split_group_id should have exactly 2 rows summing
-- to -5.50.
select split_group_id, count(*) as rows, sum(amount) as total
from public.transactions
where split_group_id in (
  'f979377d-a49d-4527-83a7-7323cb3d4a78','d5fd400a-f9f1-4834-bc45-a73b75f88da8',
  'ee0f916c-4776-4d63-8c47-a622a52def60','e5f86549-3e42-45f5-bb80-97a017ec7ddb',
  '886cdb01-66b0-44a5-91fc-cafa1f920883','96ed1857-c427-453c-8aed-eeb9b025dc05',
  '4be29c07-c9cc-46d2-ac26-0856eda73d34','36c54456-210b-4732-a6bc-b3b9b8dc98dc'
)
group by split_group_id;
-- expect: 8 rows, each with rows=2 and total=-5.50

-- 3. Spot check the one Cash App exception (10/25) got the right institution.
select id, account_id, institution_id, description from public.transactions
where split_group_id = '36c54456-210b-4732-a6bc-b3b9b8dc98dc';
-- expect: the -3.00 row on account 64b5d727 (vypr907) tagged to Nature's
-- Releaf; the new -2.50 row also on 64b5d727, tagged to Cash App (d10d7b32)

-- 4. No account balance impact check needed — both lines of every pair stay
-- on the same account as before, this only redistributes amount/place
-- between two lines (or re-tags one line), net change to any account
-- balance is $0.00.
