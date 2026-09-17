-- Verify 2026-09-17-merge-split-institutions.sql landed correctly.

-- 1. The 3 losing institutions are gone (expect 0 rows).
select * from public.institutions where id in (
  'd9a0e2a0-62c0-4889-b1a6-332d10a58feb',
  '99b7ab9e-7bf9-4587-9ee7-a9639dc3728e',
  'da813f34-1b98-4f57-bb64-30f2aaf312f9'
);

-- 2. The 3 kept institutions renamed correctly, login_username cleared
--    where applicable (expect: Labcorp/null, Alpine Medical/null,
--    Planet Fitness/null-already).
select id, name, login_username from public.institutions where id in (
  '45cbfc80-00e4-4d47-84dd-f52ccbf63409',
  'df953c6e-1162-4dd3-9fca-87d898dfbd0d',
  '8dba8e75-499b-4fa1-8a6e-da7d1777ef59'
);

-- 3. Exactly 2 member-account rows per kept institution, right usernames
--    (expect 6 rows total: Labcorp Steven w/ email, Labcorp Stephanie
--    null, Alpine Medical both w/ email, Planet Fitness both null).
select institution_id, member_id, login_username
from public.institution_member_accounts
order by institution_id, member_id;

-- 4. Every debt/bill at the 3 merged institutions now has a non-null
--    institution_member_account_id, and none still point at a deleted
--    institution (expect 0 rows with a null tag or a stale institution_id).
select id, name, institution_id, institution_member_account_id from public.debts
where institution_id in (
  '45cbfc80-00e4-4d47-84dd-f52ccbf63409','df953c6e-1162-4dd3-9fca-87d898dfbd0d',
  'd9a0e2a0-62c0-4889-b1a6-332d10a58feb','99b7ab9e-7bf9-4587-9ee7-a9639dc3728e'
);
select id, name, institution_id, institution_member_account_id from public.bills
where institution_id in (
  '8dba8e75-499b-4fa1-8a6e-da7d1777ef59','da813f34-1b98-4f57-bb64-30f2aaf312f9'
);

-- 5. No transaction still points at a deleted institution (expect 0 rows).
select count(*) as stale_transaction_institutions from public.transactions
where institution_id in (
  'd9a0e2a0-62c0-4889-b1a6-332d10a58feb',
  '99b7ab9e-7bf9-4587-9ee7-a9639dc3728e',
  'da813f34-1b98-4f57-bb64-30f2aaf312f9'
);

-- 6. Nothing else got orphaned — institution_categories exist on every
--    kept institution (expect a row for each: Labcorp/Medical, Alpine
--    Medical/Medical, Planet Fitness/Health & Wellness).
select ic.institution_id, c.name as category_name
from public.institution_categories ic
join public.categories c on c.id = ic.category_id
where ic.institution_id in (
  '45cbfc80-00e4-4d47-84dd-f52ccbf63409','df953c6e-1162-4dd3-9fca-87d898dfbd0d',
  '8dba8e75-499b-4fa1-8a6e-da7d1777ef59'
);
