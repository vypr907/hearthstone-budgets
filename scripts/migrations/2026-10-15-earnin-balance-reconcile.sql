-- 2026-10-15 — EarnIn: reconcile remaining_balance/minimum_payment to the
-- real, fully-paid-off state (ADR-111 addendum).
--
-- EarnIn is unlinked (no account to derive a balance from, unlike Dave
-- ExtraCash) — reconstructing its full ledger (6 advances totaling $550,
-- 5 repayments totaling $550, every dollar accounted for: debt_adjustments
-- ids 39b40ec2/d17739a5/fde28843/c18d8616/420f5875/49d22037 and
-- transaction ids 5aa26a9a/8d348f60/87db3066/55308cff/f328ad72) lands on
-- exactly $0 owed. The stored remaining_balance read $200 instead — the
-- exact mechanism of the drift wasn't pinned down (hand-simulating the
-- real apply_cleared_debt_payment RPC call history against the live data
-- couldn't reproduce $200 either), but the user confirmed live: EarnIn is
-- in fact paid off.
--
-- cycle_paid_to_date/payment_status reset to match what
-- apply_cleared_debt_payment itself sets on a fully-resolved (non-shortfall)
-- biweekly cycle — 0 and 'unpaid' respectively (not 'cleared'; that's this
-- app's existing convention for an advance debt between cycles, not
-- something introduced here). arrears_paid_to_date was already $0 live, so
-- it's left untouched. next_due_date is left as-is too: computeArrears()
-- short-circuits to its EMPTY state whenever remaining_balance <= 0
-- (arrears.ts), so a stale next_due_date can't trip a false "past due"
-- reading once this lands — no due-date correction needed here.
--
-- Our Household (cd8bce8c-81af-4302-8019-113e352ed443):
--   debt   EarnIn   479bd94c-ce7f-4b04-91bb-a512e008cc01

begin;

update public.debts
set
  remaining_balance = 0.00,
  minimum_payment = 0.00,
  cycle_paid_to_date = 0.00,
  payment_status = 'unpaid'
where id = '479bd94c-ce7f-4b04-91bb-a512e008cc01';

commit;
