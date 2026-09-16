-- 2026-09-15 — Link 3 credit-card debts to their matching credit accounts
-- (ADR-102 addendum). Data-only — no schema change, `linked_account_id`
-- already exists from the original ADR-102 migration
-- (2026-09-11-debt-linked-account.sql). Extends its usage beyond
-- advance-type debts (Dave ExtraCash) to credit-card-type debts for the
-- first time.
--
-- Once linked, `remaining_balance` becomes DERIVED from each account's live
-- balance (effectiveDebtBalance, src/lib/balances.ts) — never independently
-- written again. The anchor math below exists purely for continuity: it
-- sets each account's starting_balance so the very first derived read
-- after this runs matches what was already trusted, with no visible jump.
-- It is NOT a statement-accurate correction — the user is separately
-- reconciling all three against real statements and will correct these
-- numbers themselves once they have them.
--
-- GTC (a credit-card debt with no matching account anywhere in the system)
-- is deliberately excluded — stays debt-only, untouched, per the user.
--
-- Sign convention confirmed from Dave ExtraCash (the one debt already
-- linked): money owed is a NEGATIVE account balance; effectiveDebtBalance
-- takes Math.abs() of it.
--
-- anchor = -(remaining_balance) - sum(existing cleared txns already on
-- that account)
--   Milestone:     -268.00  -  0       = -268.00
--   CreditOne:     -219.55  -  0       = -219.55
--   Mission Lane: -1318.01  - (-46.12) = -1271.89
--
-- FLAG BEFORE RUNNING: Mission Lane's account already has 2 real
-- transactions on it ("Credit Protect Fee" x2, -$22.62 and -$23.50, both
-- already linked_debt_id-tagged to this same debt) with no matching
-- debt_adjustments row. The user wasn't sure whether the debt's current
-- $1,318.01 already reflects those two fees or not — this migration
-- assumes it does NOT (i.e. they're additional, matching the "not sure /
-- need to check" answer's own stated fallback). If it turns out they ARE
-- already included, change the Mission Lane starting_balance below to
-- -1318.01 instead of -1271.89 before running.

begin;

update public.debts set linked_account_id = '4785cf79-7462-4f13-9bac-a5de6f253614'
  where id = '9b78efac-bd4a-4e7b-8fe9-f2d4e7efe76c'; -- Milestone
update public.debts set linked_account_id = 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f'
  where id = '31a11f8f-36c5-4d5d-9246-27ae60f669a5'; -- CreditOne
update public.debts set linked_account_id = '2875d7b3-630b-4a14-82f1-3241db3c225e'
  where id = '3cc9ddca-9aa8-4f65-804a-7ec95836a9f7'; -- Mission Lane

update public.accounts set starting_balance = -268.00
  where id = '4785cf79-7462-4f13-9bac-a5de6f253614'; -- Milestone
update public.accounts set starting_balance = -219.55
  where id = 'ac7e1bdf-dd0a-47b1-9f4e-d5059136a38f'; -- CreditOne
update public.accounts set starting_balance = -1271.89
  where id = '2875d7b3-630b-4a14-82f1-3241db3c225e'; -- Mission Lane (flagged assumption above)

commit;
