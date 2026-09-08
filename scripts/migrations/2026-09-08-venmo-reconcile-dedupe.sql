-- 2026-09-08 — Dedupe the same-day 2026-09-08-venmo-reconcile.sql migration.
-- Data-only. Run in the Supabase SQL Editor. No schema change.
--
-- Background: that migration's date-matching used a ±1 day tolerance to
-- decide whether a CSV row was already logged in the app. Real Venmo card
-- transactions can clear 2-5 days after the purchase date the household
-- entered manually, so 13 CSV events that were ALREADY correctly logged
-- (just on a different date than Venmo's own statement shows) got
-- re-inserted as if they were missing — reported by the user via the North
-- Pole Alehouse / "drinks with MK" pair.
--
-- Re-verified with a corrected, institution+amount bucketed matcher
-- (planning/audit-v2.mjs, throwaway) that gives pre-existing rows first
-- claim on the closest-matching real CSV event before considering a
-- migration row real; cross-validated by simulating the removal and
-- re-running the audit — zero duplicates and zero new gaps afterward.
--
-- Each row deleted below is one of the 161 rows inserted by that migration.
-- Its pre-existing counterpart (same institution + amount, entered a few
-- days later — real Venmo card clearing delay) is left untouched; where a
-- merchant recurs often enough that more than one pre-existing row was a
-- plausible counterpart, none of those candidates are touched by this
-- script either way — only the migration-inserted row is removed. See
-- docs/SESSION.md for the full pairing evidence per row.

begin;

-- 2026-07-29 -8.42 McDonald's — pre-existing candidates 2026-08-01/03
delete from public.transactions where id = 'f99760ab-6f21-42c3-851b-a0bd08eec77b';

-- 2026-07-30 -6.70 McDonald's — pre-existing candidates 2026-08-02/09
delete from public.transactions where id = 'a8669d8f-ac1c-4d5a-ae23-a34057a04272';

-- 2026-08-02 -7.50 Sunrise Bagel & Espresso — pre-existing candidates 2026-08-04/06
delete from public.transactions where id = '1817b26c-3673-4385-a42c-b52fdd206f1e';

-- 2026-08-02 -2.10 Pixel Flow — pre-existing candidates 2026-08-04/05/06/09
delete from public.transactions where id = '38dedc59-7c2a-49b2-b7a5-d6d9c8ffe426';

-- 2026-08-05 -5.26 Watcher of Realms — pre-existing candidate 2026-08-07 (id 415e9e7e)
delete from public.transactions where id = 'c90194eb-9ff5-490b-b2f6-f2624a1e3245';

-- 2026-08-07 -1.04 Snapchat — pre-existing candidates 2026-08-06/09
delete from public.transactions where id = 'cf23bb20-3a5c-4691-89d8-95fc5bc0a13d';

-- 2026-08-15 -7.33 GigU — pre-existing candidate 2026-08-17 "Bill payment · GigU" (id dda609c0)
delete from public.transactions where id = 'ee9f1441-31a7-40ac-aeca-4f1b77621f1c';

-- 2026-08-17 -10.00 Siam Square Thai — pre-existing candidate 2026-08-19 (id 28565141)
delete from public.transactions where id = '9d3d2bd7-7fcc-4be3-8885-3378820af52c';

-- 2026-08-18 -16.49 McPeaks — pre-existing candidates 2026-08-20/21/24
delete from public.transactions where id = '11f4bc6c-1f21-43c5-b0ca-aa75f0cc2980';

-- 2026-08-22 -4.00 Sunrise Bagel & Espresso — pre-existing candidate 2026-08-24 (id c0191353)
delete from public.transactions where id = '9c2c4530-71dd-4d40-ad37-3633825a97c0';

-- 2026-08-22 -46.76 Brewster's Restaurant — pre-existing candidate 2026-08-24 (id 45a9d288)
delete from public.transactions where id = 'd78764c5-6700-497f-b52f-76f78a3617e6';

-- 2026-08-30 -10.20 McDonald's — pre-existing candidate 2026-09-02 (id 989b884d)
delete from public.transactions where id = '9b62d2d6-c674-4194-aa02-ba85fa41f875';

-- 2026-09-04 -9.00 North Pole Alehouse — pre-existing counterpart 2026-09-06
-- "drinks with MK" (id 8a0525fd) — the case the user caught and reported.
delete from public.transactions where id = '61247c5d-9886-47b9-89a4-71d887bb28d8';

commit;
