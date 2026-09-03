-- 2026-09-04 — Cleo bill/advance untangle + Instacash balance fix + advance-deposit backfill.
-- ADR-084 addendum / ADR-056 addendum. Data-only, "Our Household". Run in the
-- Supabase SQL Editor. No schema change. Wrap in a transaction; review the
-- verify script output before COMMIT.
--
-- IDs (Our Household cd8bce8c-81af-4302-8019-113e352ed443):
--   accounts   Classic Checking 2e937b2d-471a-46f3-9a9d-cfc342a66414
--              Steven's Savings 6698cc8a-db5d-4937-9213-7b77fd3e4556
--              Venmo - Steven   9a1a0f9a-c966-4038-a108-36766faf83d3
--   institution Cleo            32ddce8d-df53-4de5-aadc-7818079f10da
--   categories Financial        f6562ef9-ff93-43c7-a554-47fd204a6ded
--              Fees             be4f75e5-9ba0-4637-a790-ee9ce21bb83f
--   Cleo Plus bill              8da52c79-c266-4b69-acde-5f22cf8c42db
--   Cleo advance debt           085f2811-f7b3-4491-a32e-869a747dfd4b
--   Instacash advance debt      e598a47c-5c39-46ad-b289-4127bd46683d

begin;

-- ── A. Cleo ──────────────────────────────────────────────────────────────────

-- A1. The 8/14 "bill payment $5.99 + $1 fee" split was really one Venmo
--     "Cleo Express Fee" ($6.99). Delete both rows. (Elapsed cycle,
--     bill.cycle_paid_to_date = 0 — no bill-row rollback needed.)
delete from public.transactions
where id in (
  'be5361dc-459b-460a-a2f3-83c87d48eeb2',   -- -5.99 "Bill payment · Cleo", Venmo
  'e880aaec-f043-4fda-824f-3303886c4bf8'    -- -1.00 "Fee: Cleo", Venmo
);

-- A2. The real 8/3 Cleo Plus bill payment (present in USAA, missing here).
insert into public.transactions
  (household_id, account_id, category_id, institution_id, amount, status,
   description, transaction_date, linked_bill_id)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443',
   '2e937b2d-471a-46f3-9a9d-cfc342a66414',
   'f6562ef9-ff93-43c7-a554-47fd204a6ded',
   '32ddce8d-df53-4de5-aadc-7818079f10da',
   -5.99, 'cleared', 'Bill payment · Cleo', '2026-08-03',
   '8da52c79-c266-4b69-acde-5f22cf8c42db');

-- A3. The 8/14 Cleo Express Fee ($6.99), on the ADVANCE, as a fee. Ledger-only
--     (the advance balance is already 0 and fees never move it).
insert into public.transactions
  (household_id, account_id, category_id, institution_id, amount, status,
   description, transaction_date, linked_debt_id)
values
  ('cd8bce8c-81af-4302-8019-113e352ed443',
   '9a1a0f9a-c966-4038-a108-36766faf83d3',
   'be4f75e5-9ba0-4637-a790-ee9ce21bb83f',
   '32ddce8d-df53-4de5-aadc-7818079f10da',
   -6.99, 'cleared', 'Fee: Cleo · advance fee — Express fee', '2026-08-14',
   '085f2811-f7b3-4491-a32e-869a747dfd4b');

-- A4. Tidy the two existing Cleo advance rows.
update public.transactions
set linked_debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b'
where id = '21a37c87-f622-49ce-a470-6ab38a1070c5';           -- +40 deposit

update public.transactions
set description = 'Debt payment · Cleo'
where id = '5d68c34d-b98b-4333-9a08-0bfe1e952de4'            -- -40 repayment
  and description is null;

-- ── B. Instacash ─────────────────────────────────────────────────────────────

-- B1. The 7/17 -$443.03 payment settled a July advance that was already closed;
--     it wrongly cut the current advance's balance from $600 to $156.97 (and
--     minimum_payment with it). Unlink it — it stays a cleared Advances expense
--     on Classic Checking so the account balance is right.
update public.transactions
set linked_debt_id = null
where id = 'd48527f7-2ab7-4ce4-99d2-d55f962c1ad8';

-- B2. Restore the current advance (8/28, $600, unrepaid).
update public.debts
set remaining_balance = 600.00,
    minimum_payment   = 600.00
where id = 'e598a47c-5c39-46ad-b289-4127bd46683d';

-- NOTE: recorded advances ($2,400) vs kept repayments ($2,034.90) still leave a
-- ~$234.90 residual (= the 7/20 payment). Reconcile against MoneyLion separately
-- — this script does NOT touch it.

-- ── C. Advance-deposit backfill (ADR-056 addendum) ───────────────────────────
-- Every historical advance deposit should carry linked_debt_id so it shows in
-- the debt's Recent Transactions (new code sets it going forward).
update public.transactions t
set linked_debt_id = d.id
from public.debts d
where t.household_id = 'cd8bce8c-81af-4302-8019-113e352ed443'
  and t.linked_debt_id is null
  and t.transfer_group_id is not null
  and t.amount > 0
  and t.description = 'Advance: ' || d.name
  and d.household_id = t.household_id
  and lower(coalesce(d.debt_type, '')) = 'advance';

commit;
