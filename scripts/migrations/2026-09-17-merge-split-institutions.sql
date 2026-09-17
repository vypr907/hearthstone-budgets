-- 2026-09-17 — Merge Labcorp/Alpine Medical/Planet Fitness's per-spouse
-- split institutions into one institution each (ADR-106 addendum).
-- Data-only, no schema change — uses ADR-106's institution_member_accounts
-- table, already live.
--
-- Checked live before writing this: within each pair, login_url/logo_url/
-- description/notes are IDENTICAL — the only difference is login_username,
-- which now belongs on a per-member institution_member_accounts row
-- instead. No accounts reference any of the 6 institutions being merged.
-- Both sides of every pair already carry the same institution_categories
-- tag, so nothing is lost when the losing side's row (and its cascaded
-- institution_categories row) is deleted.
--
-- Member ids (household_members): Steven = f93a0ac9-f89c-4615-97bd-13bbe01d32ac
-- ("You", role owner), Stephanie = 545e684e-70ea-4492-9801-36551cca25cf.
--
-- Kept vs. deleted per pair (kept = the side with more existing linked
-- debts/bills, fewer rows to re-point):
--   Labcorp:        keep 45cbfc80-... ("- Stephanie"), delete d9a0e2a0-... ("- Steven")
--   Alpine Medical: keep df953c6e-... ("- Stephanie"), delete 99b7ab9e-... ("- Steven")
--   Planet Fitness: keep 8dba8e75-... ("- Me" = Steven), delete da813f34-... ("- You" = Stephanie)
--
-- New institution_member_accounts ids (hardcoded, referenced below):
--   Labcorp Steven:        c1a5e106-0000-4000-8000-000000000001
--   Labcorp Stephanie:     c1a5e106-0000-4000-8000-000000000002
--   Alpine Medical Steven: c1a5e106-0000-4000-8000-000000000003
--   Alpine Medical Steph:  c1a5e106-0000-4000-8000-000000000004
--   Planet Fitness Steven: c1a5e106-0000-4000-8000-000000000005
--   Planet Fitness Steph:  c1a5e106-0000-4000-8000-000000000006
--
-- "Alpine Surgery" is unrelated (confirmed with the user) — untouched.
-- The 3 identical $0 "Labcorp - Stephanie" debts and other $0 rows are
-- left exactly as-is per the user — just re-pointed/tagged like everything
-- else, no consolidation.

begin;

-- ---------- Labcorp ----------

insert into public.institution_member_accounts (id, institution_id, member_id, login_username)
values
  ('c1a5e106-0000-4000-8000-000000000001', '45cbfc80-00e4-4d47-84dd-f52ccbf63409',
   'f93a0ac9-f89c-4615-97bd-13bbe01d32ac', 'steven.laszloffy@gmail.com'),
  ('c1a5e106-0000-4000-8000-000000000002', '45cbfc80-00e4-4d47-84dd-f52ccbf63409',
   '545e684e-70ea-4492-9801-36551cca25cf', null);

update public.debts set institution_member_account_id = 'c1a5e106-0000-4000-8000-000000000002'
  where id in ('6263ad27-e249-4902-aba2-f7cb3dd52fbb', '0fe9126f-a9c5-4e11-9302-440ce12f9c88',
               'aa369e3f-fff7-4d31-904b-466036dafa88'); -- Labcorp - Stephanie x3

update public.debts set
  institution_id = '45cbfc80-00e4-4d47-84dd-f52ccbf63409',
  institution_member_account_id = 'c1a5e106-0000-4000-8000-000000000001'
  where id = '8d375e82-9b7e-462f-932b-69ff4053007e'; -- Labcorp - Steven

update public.transactions set institution_id = '45cbfc80-00e4-4d47-84dd-f52ccbf63409'
  where institution_id = 'd9a0e2a0-62c0-4889-b1a6-332d10a58feb';

update public.institutions set name = 'Labcorp', login_username = null
  where id = '45cbfc80-00e4-4d47-84dd-f52ccbf63409';

delete from public.institutions where id = 'd9a0e2a0-62c0-4889-b1a6-332d10a58feb'; -- Labcorp - Steven

-- ---------- Alpine Medical ----------

insert into public.institution_member_accounts (id, institution_id, member_id, login_username)
values
  ('c1a5e106-0000-4000-8000-000000000003', 'df953c6e-1162-4dd3-9fca-87d898dfbd0d',
   'f93a0ac9-f89c-4615-97bd-13bbe01d32ac', 'steven.laszloffy@gmail.com'),
  ('c1a5e106-0000-4000-8000-000000000004', 'df953c6e-1162-4dd3-9fca-87d898dfbd0d',
   '545e684e-70ea-4492-9801-36551cca25cf', 'stephanie.laszloffy@gmail.com');

update public.debts set institution_member_account_id = 'c1a5e106-0000-4000-8000-000000000004'
  where id in ('b95b04e8-d661-4933-aa79-4cdcd60864a4', '9680bbb9-671d-48cf-9ce0-d57613e22db0');
  -- "Old Steph Bill", "Alpine Medical - Stephanie"

update public.debts set
  institution_id = 'df953c6e-1162-4dd3-9fca-87d898dfbd0d',
  institution_member_account_id = 'c1a5e106-0000-4000-8000-000000000003'
  where id = '7b8e36f0-8be4-4cab-ba70-a01cebf189c3'; -- Alpine Medical - Steven

update public.transactions set institution_id = 'df953c6e-1162-4dd3-9fca-87d898dfbd0d'
  where institution_id = '99b7ab9e-7bf9-4587-9ee7-a9639dc3728e';

update public.institutions set name = 'Alpine Medical', login_username = null
  where id = 'df953c6e-1162-4dd3-9fca-87d898dfbd0d';

delete from public.institutions where id = '99b7ab9e-7bf9-4587-9ee7-a9639dc3728e'; -- Alpine Medical - Steven

-- ---------- Planet Fitness ----------

insert into public.institution_member_accounts (id, institution_id, member_id, login_username)
values
  ('c1a5e106-0000-4000-8000-000000000005', '8dba8e75-499b-4fa1-8a6e-da7d1777ef59',
   'f93a0ac9-f89c-4615-97bd-13bbe01d32ac', null),
  ('c1a5e106-0000-4000-8000-000000000006', '8dba8e75-499b-4fa1-8a6e-da7d1777ef59',
   '545e684e-70ea-4492-9801-36551cca25cf', null);

update public.bills set institution_member_account_id = 'c1a5e106-0000-4000-8000-000000000005'
  where id = 'c8ae47fd-7e49-40c9-9fcc-c302735d3a3f'; -- Planet Fitness - Me

update public.bills set
  institution_id = '8dba8e75-499b-4fa1-8a6e-da7d1777ef59',
  institution_member_account_id = 'c1a5e106-0000-4000-8000-000000000006'
  where id = '9424323f-5905-4d6c-9a13-567727a06ea4'; -- Planet Fitness - You

update public.transactions set institution_id = '8dba8e75-499b-4fa1-8a6e-da7d1777ef59'
  where institution_id = 'da813f34-1b98-4f57-bb64-30f2aaf312f9';

update public.institutions set name = 'Planet Fitness'
  where id = '8dba8e75-499b-4fa1-8a6e-da7d1777ef59';

delete from public.institutions where id = 'da813f34-1b98-4f57-bb64-30f2aaf312f9'; -- Planet Fitness - You

notify pgrst, 'reload schema';

commit;
