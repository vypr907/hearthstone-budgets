-- 2026-09-09 — Remove a leftover duplicate "Xfer to Steph" transfer, found
-- by the user comparing the app against Venmo by hand (separate from, and
-- independent of, the 2026-09-08 dedupe/dedupe2 passes — does not overlap
-- any row those touch).
--
-- Venmo shows 3 transfers to Steph in the window: 8/7 -$25.44, 8/7 -$25.44,
-- 8/13 -$25.44 (the user's "8/17" was a mis-recollection of the 8/13 date).
-- The app has 4: 8/1, 8/7 x2, 8/13. The two 8/7 pairs already correctly
-- model "-$25.44 leaves Venmo / +$25.00 arrives at Steph One Checking" via
-- ADR-097's transfer+fee mechanism (transfer leg $25/$25, separate -$0.44
-- fee row on the from-account only). The 8/13 pair has no fee, matching
-- Venmo's single unadorned $25.44 line for that date. The 8/1 pair is a
-- plain, fee-less duplicate of no Venmo statement line at all.
--
-- transfer_group_id d0560102-7378-4175-8c10-7c5616ac1805 (the 8/1 pair):
--   e9d23fdc-290e-46cf-ab70-2d27d13d64fe  Venmo leg      -25.44  "Xfer to Steph"
--   cac58274-dba9-470c-abc5-896b1d6f68de  Steph One leg  +25.44  "Xfer to Steph"

begin;

delete from public.transactions where id in (
  'e9d23fdc-290e-46cf-ab70-2d27d13d64fe',
  'cac58274-dba9-470c-abc5-896b1d6f68de'
);

commit;
