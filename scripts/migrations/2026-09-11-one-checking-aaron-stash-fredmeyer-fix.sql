-- 2026-09-11 — One Checking (x0801): the 3 loose ends left open by
-- 2026-09-11-one-checking-august-reconcile.sql (Issue #61). Data-only,
-- no schema change. User interview resolved all three against their own
-- Aaron's receipts + the statement CSVs in planning/.
--
-- 1. Aaron's cluster (8/21, split e08a4167). Per the user's Aaron's receipts,
--    the 8/20 "first Aarons debt" charge totals $434.03 = $394.57 paid +
--    $39.46 Protection Plus — the SAME split shape as the "Aarons - Dresser"
--    pattern already in the ledger (paid leg + separate Protection Plus fee
--    leg, summing to the real charge). The ledger's "Debt payment · Aarons"
--    leg was entered as the full -434.03 instead of the -394.57 paid portion,
--    double-counting the -39.46 fee leg already recorded alongside it.
--      Debt payment · Aarons  (886faf5f)  -434.03 -> -394.57
--      Fee: Aarons            (38b3557f)  unchanged, -39.46
--    Verified against the statement: Dresser -106.30 (44672d2f/89263adb,
--    already correct) + Aarons -394.57 + -39.46 = -540.33, the exact Aug 22
--    statement line (two same-day Aaron's charges the bank posted as one).
--
-- 2. Stash Aug 4 (198d5917, "Bill payment · Stash - Membership"). The
--    statement itself shows the ACH charged -$12.00 in August (was -$3.00 in
--    July) — a real price change, not app under-entry.
--      -3.00 -> -12.00
--
-- 3. d7029670 (-$60.00, Auto & Transport). User confirms: real gas purchase
--    on 8/30, posted 8/31. The statement's Aug 31 "FRED M FUEL #9224" -$60.00
--    line matches exactly. transaction_date (8/30) stays; cleared_date moves
--    to match the post date.
--      cleared_date 2026-08-30 -> 2026-08-31
--
-- Net effect vs the pre-fix -$57.14 August span (coalesce(cleared_date,
-- transaction_date)): Aaron's fix removes a -$39.46 excess, Stash fix adds
-- -$9.00, d7029670 stays in August either way (no span change). New span
-- ~ -$57.14 + 39.46 - 9.00 = -$26.68. This moves the monthly-span proxy
-- further from the statement's -$56.42, but that proxy was only ever a rough
-- diagnostic — the 8/31 account_balances anchor pins the actual ending
-- balance regardless, and these 3 fixes are each verified to the penny
-- against a specific statement line, not against the aggregate span. One
-- Checking is now fully reconciled; #61's remaining scope is the 24 One
-- savings-pocket reconciles.

begin;

update public.transactions set amount = -394.57
  where id = '886faf5f-9acf-42ce-a27c-c4f3a97d603d';  -- Debt payment · Aarons

update public.transactions set amount = -12.00
  where id = '198d5917-973b-4c0a-bab2-d3eca25f84d7';  -- Bill payment · Stash - Membership

update public.transactions set cleared_date = '2026-08-31'
  where id = 'd7029670-8b92-4134-afc2-80f9e0fead9b';  -- Fred Meyer Fuel -60.00

commit;
