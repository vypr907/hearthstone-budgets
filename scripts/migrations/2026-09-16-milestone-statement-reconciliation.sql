-- 2026-09-16 — Milestone: reconcile account/debt against real Jul/Aug/Sep
-- 2026 statements (docs/planning/milestone_JUL.pdf, _AUG.pdf, _SEP.pdf).
-- Data-only, no schema change, no new ADR — a direct continuation of
-- scripts/migrations/2026-09-15-credit-debt-account-links.sql, whose own
-- comment explicitly punted on exact numbers pending real statements.
--
-- Root cause found along the way: a leftover account_balances snapshot
-- (2026-07-09, $298.45, logged 2026-07-28 — the same day the debt was
-- first entered, before it was linked to this account) was silently
-- overriding accounts.starting_balance as the balance anchor
-- (computeBalances prefers the latest snapshot over starting_balance).
-- Deleted below so the account becomes purely transaction-driven, matching
-- Mission Lane/CreditOne.
--
-- Two pre-existing "Debt payment · Milestone" transactions (linked_debt_id
-- tagged, living on the FUNDING accounts) predate the 9/15 account link,
-- so they were never mirrored onto the Milestone account itself:
--   8233aa00-... 2026-07-28 -$20.00 (Venmo)        — matches the August
--     statement's 07/27 "PAYMENT RECEIVED - THANK YOU". Same real payment,
--     not a duplicate.
--   c28817a8-... 2026-09-11 (cleared 09-15) -$20.00 (One Checking) — made
--     AFTER the Sept 9 statement closed, not yet on any statement.
-- Both get a proper mirror leg + shared transfer_group_id, the same shape
-- useMarkSubmitted/useMarkCleared produce (src/lib/payments.ts).
--
-- Anchor: starting_balance = -288.45 (July statement's "Previous Balance",
-- the balance before any transaction below). Running it forward:
--   -288.45  anchor
--   -10.00   06/15 Fred M Fuel        -> -298.45   = July close  ($298.45)
--   +20.00   07/28 payment mirror     -> -278.45
--    -8.95   07/29 Crumb.Pet Tampa    -> -287.40
--    -8.95   08/03 Crumb Newark       -> -296.35   = Aug/Sep close ($296.35)
--   +20.00   09/11 payment mirror     -> -276.35   = current true balance
-- All three statement closing balances reproduce exactly.
--
-- debts.remaining_balance is derived/display-only for a linked debt
-- (ADR-102 addendum) but the raw column is still the baseline several
-- mutations read before writing back (Issue #67), so it's kept in sync
-- here too, along with minimum_payment/next_due_date (both stale, from
-- the August statement).
--
-- payment_status / cycle_paid_to_date / opening_arrears / arrears_as_of /
-- arrears_paid_to_date deliberately NOT touched — src/routes/app.debts.tsx
-- has a built-in "Sync stored status" button (useSyncStoredStatus,
-- src/lib/payments.ts) that reconciles payment_status/cycle_paid_to_date
-- from the ledger once this runs; tap it on the Milestone debt's detail
-- dialog afterward. No evidence the arrears fields are wrong.
--
-- Categories: FRED M FUEL #9224 -> Auto & Transport; both CRUMB.PET
-- charges -> Pets (user's call — ambiguous merchant names, description
-- text kept verbatim from the statement rather than guessed/prettified).

begin;

-- Remove the stale pre-linking snapshot that was overriding the anchor.
delete from public.account_balances where id = '3fd2844f-7b70-485a-b9f0-e17f2a5d1103';

-- Link the two pre-existing real payments to their new account mirrors below.
update public.transactions set transfer_group_id = 'a2e6c1a0-0000-4000-8000-000000000001'
  where id = '8233aa00-ac18-4a93-ab65-2e774bb0f455';
update public.transactions set transfer_group_id = 'a2e6c1a0-0000-4000-8000-000000000002'
  where id = 'c28817a8-9247-420e-bfe4-59b78156e5ef';

insert into public.transactions
  (household_id, account_id, institution_id, category_id, amount, status,
   description, transaction_date, cleared_date, transfer_group_id)
values
  -- Statement-sourced purchases (plain expenses on the account, no linked_debt_id).
  ('cd8bce8c-81af-4302-8019-113e352ed443', '4785cf79-7462-4f13-9bac-a5de6f253614',
   '764c51a2-dae7-4564-8590-747bc1f4198f', '0f63e7bb-7c8b-457a-87c0-28756dc62995',
   -10.00, 'cleared', 'FRED M FUEL #9224', '2026-06-15', '2026-06-15', null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '4785cf79-7462-4f13-9bac-a5de6f253614',
   '764c51a2-dae7-4564-8590-747bc1f4198f', '8d2d98a2-bc3b-48bd-af33-4582c67aa042',
   -8.95, 'cleared', 'CRUMB.PET TAMPA FL', '2026-07-29', '2026-07-29', null),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '4785cf79-7462-4f13-9bac-a5de6f253614',
   '764c51a2-dae7-4564-8590-747bc1f4198f', '8d2d98a2-bc3b-48bd-af33-4582c67aa042',
   -8.95, 'cleared', 'CRUMB NEWARK DE', '2026-08-03', '2026-08-03', null),
  -- Payment mirrors (credit reducing what's owed), paired to the two existing rows above.
  ('cd8bce8c-81af-4302-8019-113e352ed443', '4785cf79-7462-4f13-9bac-a5de6f253614',
   '764c51a2-dae7-4564-8590-747bc1f4198f', null,
   20.00, 'cleared', 'Debt payment · Milestone', '2026-07-28', '2026-07-28',
   'a2e6c1a0-0000-4000-8000-000000000001'),
  ('cd8bce8c-81af-4302-8019-113e352ed443', '4785cf79-7462-4f13-9bac-a5de6f253614',
   '764c51a2-dae7-4564-8590-747bc1f4198f', null,
   20.00, 'cleared', 'Debt payment · Milestone', '2026-09-11', '2026-09-15',
   'a2e6c1a0-0000-4000-8000-000000000002');

update public.accounts set starting_balance = -288.45
  where id = '4785cf79-7462-4f13-9bac-a5de6f253614'; -- Milestone

update public.debts set
  remaining_balance = 276.35,
  minimum_payment = 20.00,
  next_due_date = '2026-10-08'
  where id = '9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c'; -- Milestone

commit;
