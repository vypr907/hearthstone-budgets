-- 2026-09-13 — Cash tracking, per-member Cash accounts (ADR-103). DATA ONLY,
-- no schema change: account_type carries no DB check constraint (unlike
-- institution_type, ADR-099), so "cash" is already a legal value.
--
-- One account per household member (owner_member_id set, not joint) — cash
-- in a wallet belongs to whoever's holding it, matching ADR-088's per-member
-- scoping. No institution_id: physical cash has no institution.

begin;

insert into public.accounts (
  household_id, institution_id, name, account_type, is_spendable,
  include_in_net_worth, owner_member_id, starting_balance
) values (
  'cd8bce8c-81af-4302-8019-113e352ed443', null, 'Cash — You', 'cash', true,
  true, 'f93a0ac9-f89c-4615-97bd-13bbe01d32ac', 0
);

insert into public.accounts (
  household_id, institution_id, name, account_type, is_spendable,
  include_in_net_worth, owner_member_id, starting_balance
) values (
  'cd8bce8c-81af-4302-8019-113e352ed443', null, 'Cash — Stephanie', 'cash', true,
  true, '545e684e-70ea-4492-9801-36551cca25cf', 0
);

commit;
