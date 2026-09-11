-- 2026-09-11 — Retroactive backfill for the split-transaction Place bug
-- (ADR-063/098 addendum, fixed in code this session: AddTransactionFab's
-- split path never forwarded the selected institution — see
-- src/lib/data-hooks.ts's useSaveSplitTransaction). Data-only, no schema
-- change, no ADR (backfill of an existing bug fix, not a new decision).
--
-- SCOPE: 35 split rows in "Our Household" have no institution_id, but only 4
-- split groups (8 rows) actually render the generic "Transaction" fallback —
-- the other 27 (paycheck/deduction splits, e.g. "Paycheck: ASRC Federal",
-- "Deduction: HSA") have a description, so TransactionTitle already shows
-- meaningful text for them regardless of institution_id. Those are left
-- alone; backfilling institution_id there would have no visible effect
-- (would require exposing a Place field on paycheck rows, out of scope of
-- the bug actually reported).
--
-- 1. 9/1 ATM withdrawal + fee (split 053e54e3: -80.00 "Green" + -3.00 "Fees")
--    and 9/1 ATM withdrawal + fee (split 3c80fd0a: -20.00 "Green" + -3.00
--    "Fees") — both match the existing "Nature's Releaf LLC" institution;
--    this exact cash-withdrawal-at-the-dispensary pattern (ATM Withdrawal +
--    PIN/ATM fees) recurs throughout the ledger history already tagged to
--    that institution.
-- 2. 8/27 split (f3ea5b76: -40.00 "Auto & Transport" + -3.98 "Snacks &
--    Drinks") matches the existing "Fred Meyers" institution — a gas-stop
--    snack purchase, the same pattern as ~8 other Fred Meyer entries.
-- 3. 9/3 split (0eeae487: -15.99 "Smoking" + -15.97 "Snacks & Drinks",
--    $31.96 total) — OnePay's feed shows "General Store Badge, North Pole
--    AK"; user confirmed this is "McPeaks" (their most common institution
--    for this exact category pairing, 29 prior transactions).

begin;

update public.transactions set institution_id = 'f06240f2-c46e-45c2-b9d0-7161fb33d4e4'  -- Nature's Releaf LLC
  where id in (
    '9b59a535-b955-444f-b1b6-6348adf84459', '0bb49954-7935-4c8f-a922-d9435acb6640',  -- 053e54e3
    'd88fd480-7b76-4af4-89b8-2ffe08b396f9', 'd31f3371-0e08-4bb8-80e9-cc5dfae069d9'   -- 3c80fd0a
  );

update public.transactions set institution_id = 'c166c7bd-4b67-4eb2-90ab-0854acca957d'  -- Fred Meyers
  where id in (
    '77300575-57d9-480e-8742-2c336f24346c', '3101f598-3b26-4854-b591-8a97044ab16a'   -- f3ea5b76
  );

update public.transactions set institution_id = 'a5daa10e-c0f0-40ba-8b83-5a817963421a'  -- McPeaks
  where id in (
    'bcc8089a-99be-44ac-9a79-a0fdc1ce3e95', 'ae60483c-243a-4939-8e32-3a5e658567cf'   -- 0eeae487
  );

commit;
