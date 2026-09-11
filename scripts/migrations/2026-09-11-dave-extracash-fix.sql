-- 2026-09-11 — Dave ExtraCash (debt da042cbb): correct remaining_balance /
-- minimum_payment / cycle_paid_to_date / next_due_date after a known bug
-- class silently dropped 2 of the 4 balance-changing events logged today.
-- Data-only, no schema change, no ADR (data correction, not a new decision).
--
-- ROOT CAUSE (already known — see the comment at app.debts.tsx:1551, "found
-- via the OnePay Advance incident, 2026-08-24"): every debt-balance mutation
-- (useCreateAdvance, useAddDebtAdjustment, applyClearedPayment) computes
-- `next = <the browser's currently-held debt.remaining_balance> + amount`
-- and writes that absolute value — never an atomic DB increment. Two
-- mutations fired close together (before the first's result round-trips
-- back into the UI) silently overwrite each other instead of adding up.
--
-- EVIDENCE: `debt_adjustments` is written as an independent insert per event
-- (immune to this bug) and durably shows all 4 of today's real events:
--   advance +50.00  adjustment_date 2026-09-04  (1e855881, created 22:32:20)
--   advance +50.00  adjustment_date 2026-09-04  (04bc136d, created 22:32:41)
--   other   +5.00   "Overdraft Fee"             (a5c12d6c, created 22:34:09)
--   other   +5.00   "Overdraft Fee"             (9e284c95, created 22:34:41)
-- Sum = 110.00, matching the user's own expectation exactly. The debt's
-- stored remaining_balance (55.00 = one 50 + one 5) shows only the LAST
-- write of each racing pair survived.
--
-- Confirmed the pre-9/4 balance really was $0: the 7/31 payment (-75.00)
-- and the two 8/27 payments (-25.00 + -25.00) exactly cover the 7/17+7/18
-- advances (40+35=75) and the 8/20 advance (50), respectively. The same
-- race bug hit the second 8/27 payment too — it should have satisfied that
-- cycle and rolled next_due_date from 8/27 to 8/27+14d=9/10 (biweekly), but
-- landed as a second independent "shortfall" write instead, leaving
-- next_due_date stuck at 8/27. Matches the user's own stated expectation
-- ("due date should have been 9/10").
--
-- New cycle since 9/4 has had no payment yet, so cycle_paid_to_date resets
-- to 0 and payment_status is unpaid. minimum_payment mirrors
-- remaining_balance for debt_type='advance' (ADR-056 addendum).

begin;

update public.debts set
  remaining_balance = 110.00,
  minimum_payment = 110.00,
  cycle_paid_to_date = 0.00,
  payment_status = 'unpaid',
  next_due_date = '2026-09-10'
where id = 'da042cbb-9173-46ab-8c8d-376dab131600';

commit;
