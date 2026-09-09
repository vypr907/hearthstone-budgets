-- 2026-09-08 — Second dedupe pass on 2026-09-08-venmo-reconcile.sql, found
-- while investigating a wrong account balance (-$156 shown, ~$72 expected).
-- Data-only. Run in the Supabase SQL Editor. No schema change.
--
-- The first dedupe (2026-09-08-venmo-reconcile-dedupe.sql) only caught
-- duplicates where a single existing row matched a migration row's amount
-- exactly. These 6 were missed because the real event was already recorded
-- as a DIFFERENT SHAPE than the migration assumed:
--
--   1. Finch (-$10.54, 8/4): already tracked as a recurring Bill —
--      "Bill payment · Finch" (-$9.99) + "Fee: Finch" (-$0.55) on 8/6
--      already total exactly $10.54. The migration inserted a THIRD,
--      redundant row for the same subscription charge.
--   2-3. UberEats (-$25.28 + -$7.31, both 8/18): the household had already
--      logged this as ONE lump-sum row (-$32.59, 8/19) instead of two.
--      Both migration rows are redundant.
--   4-6. Nature's Releaf (-$63.00 x2, -$43.00 x1, on 8/18/8/21/8/22): per
--      the user, these are ATM cash pulls at the dispensary — $60/$60/$40
--      cash out, plus a $3 Nature's Releaf ATM surcharge (both included in
--      Venmo's own "$63/$63/$43" statement line) plus a separate $2.50
--      Venmo network fee that Venmo's CSV does NOT itemize under that same
--      line at all — so the household's original $65.50/$65.50/$45.50
--      entries were already complete and correct; the CSV-exact migration
--      rows are actually incomplete duplicates, not corrections.
--      (The 4th CSV "Nature's Releaf 3 -$63.00" row, dated 8/30, has no
--      pre-existing counterpart at all and is a genuine new entry — left
--      alone, not part of this delete.)
--
-- Verified before writing: simulated removing exactly these 6 ids and
-- re-ran the reconciler — the same 6 CSV rows (plus the 2 already-known
-- benign artifacts from the first dedupe) correctly reappear as "missing"
-- (expected false negatives of the tool's single-row/lump-sum matching,
-- not real gaps), nothing else changed.

begin;

-- 2026-08-04 -10.54 "Google Finch Self Car" — duplicate of the existing
-- Bill payment · Finch (-9.99) + Fee: Finch (-0.55) pair on 2026-08-06.
delete from public.transactions where id = '05a9278e-1de6-49bd-9f5b-ce126e543590';

-- 2026-08-18 -25.28 "UBER * EATS PENDING" and -7.31 "UBER *EATS
-- HELP.UBER.C" — together duplicate the existing lump-sum -32.59 row on
-- 2026-08-19.
delete from public.transactions where id = 'c060acba-926c-4105-b235-e0d429af8182';
delete from public.transactions where id = '46115fa2-3773-4c40-84b8-3ec3362ad784';

-- 2026-08-18 -63.00, 2026-08-21 -63.00, 2026-08-22 -43.00 "Nature's
-- Releaf" — each duplicates (incompletely — missing the $2.50 Venmo fee
-- the CSV doesn't itemize) an existing, already-correct row.
delete from public.transactions where id = '983338c5-4d91-4700-a7da-b33237e5b536';
delete from public.transactions where id = '63dbe1f6-c2ec-4e14-aafa-3757eb917056';
delete from public.transactions where id = 'e98d71f1-a3a6-4dec-83ec-e1b20f1a0cd5';

commit;
