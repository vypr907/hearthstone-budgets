-- 2026-09-14 — EarnIn (debt 479bd94c): correct remaining_balance /
-- minimum_payment / next_due_date after the 8/28 repayment's balance
-- decrement and cycle roll silently got lost. Data-only, no schema change,
-- no ADR (data correction, not a new decision) -- same shape as
-- scripts/migrations/2026-09-11-dave-extracash-fix.sql.
--
-- ROOT CAUSE: the 8/18 advance draw and 8/28 repayment both predate this
-- month's ADR-101 / Issue #66 atomic-RPC fixes (applied 2026-09-11/13) --
-- the same "read balance from the browser, write the absolute result back"
-- bug class those fixes closed prospectively, evidently never individually
-- repaired for this debt. Today's 9/14 advance (drawn after the atomic RPCs
-- were live) correctly added $100 on top of whatever remaining_balance
-- already held -- it just added onto an already-wrong base.
--
-- EVIDENCE (all via the read-only MCP): `debt_adjustments` is an
-- independent insert-per-event log, immune to the bug -- shows exactly two
-- $100 advances, 8/18 and 9/14, nothing else. The transactions ledger shows
-- the matching -$100 "Debt payment · EarnIn" on 8/28, cleared. Net:
-- 100 - 100 + 100 = 100.00, matching the user's own expectation. The
-- stored remaining_balance (200.00) shows the repayment's decrement never
-- landed. cycle_paid_to_date is 0.00 and next_due_date is still 2026-08-27,
-- confirming the repayment never actually resolved/rolled the cycle either.
--
-- next_due_date: this migration applies two successive biweekly rolls
-- (2026-08-27 -> 09-10 -> 09-24) per the user's confirmation that 9/24 is
-- EarnIn's real next repayment date, not the single-roll (09-10) result
-- that just resolving the 8/28 payment alone would mechanically produce --
-- confirmed with the user directly rather than assumed.
--
-- New cycle has had no payment yet, so cycle_paid_to_date resets to 0 and
-- payment_status is unpaid. minimum_payment mirrors remaining_balance for
-- debt_type='advance' (ADR-056 addendum).

begin;

update public.debts set
  remaining_balance = 100.00,
  minimum_payment = 100.00,
  cycle_paid_to_date = 0.00,
  payment_status = 'unpaid',
  next_due_date = '2026-09-24'
where id = '479bd94c-ce7f-4b04-91bb-a512e008cc01';

commit;
