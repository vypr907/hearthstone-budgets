-- 2026-09-24 — Recategorize the last 2 legacy "Cash & Checks" transactions
-- (Issue #68).
--
-- ADR-103 retired the "Cash & Checks" category for new entries — cash
-- withdrawals now go through the "Cash Back" combo (a transfer to a
-- per-member Cash account) instead of being counted as spend immediately.
-- These 2 pre-existing rows were left as-is when ADR-103 landed.
--
-- Both are "ATM withdrawal (Nature's Releaf)", 2026-07-02, on
-- "One Checking - Steven" — an ATM pull fully spent same-day at that same
-- dispensary. Every other Nature's Releaf transaction in the ledger, before
-- and after this pair, is categorized "Green" (708cce35-...), with ATM
-- surcharges split out into "Fees" (be4f75e5-...). There's no leftover cash
-- here to model as a Cash Back transfer (ADR-103's "pure withdrawal, no
-- purchase attached" case doesn't apply — this was fully spent), so a plain
-- recategorization to match every sibling transaction is correct.

begin;

update public.transactions
set category_id = '708cce35-a411-4d48-a873-4e9dd48536ed'  -- Green (Health)
where id in (
  '42abaea3-10f0-404f-84bb-aa2c7d7a705f',  -- 7/2 ATM withdrawal (Nature's Releaf) -40.00
  '238c8495-3362-428a-870d-1028fcb7737f'   -- 7/2 ATM withdrawal (Nature's Releaf) -20.00
)
and category_id = '92810d6e-371e-458d-94c7-7cb53539188d';  -- Cash & Checks

commit;
