-- 2026-11-03 — Fix: remove 2 spurious debt_adjustments rows from
-- 2026-11-03-venmo-reconcile-sep-oct.sql. Data-only. Run in the Supabase SQL
-- Editor. No schema change.
--
-- That migration wrote a debt_adjustments row (adjustment_type='repayment')
-- for each of Cleo's 2 new repayments (10/22, 10/31), on top of the real
-- linked `transactions` row each repayment already had. 'repayment' isn't a
-- real adjustment_type anywhere else in this app — repayments are tracked
-- only via the linked transaction, never a debt_adjustments row. Net effect:
-- each $55 repayment was double-counted in the advance-episode view
-- (computeAdvanceEpisodes, src/lib/debt-episodes.ts), and both spurious rows
-- showed up in the Debts screen's Adjustments list, where no real
-- repayment ever appears.
--
-- Does NOT touch debts.remaining_balance/minimum_payment — those are
-- already correct ($55.00), set directly by the original migration's
-- `update public.debts`, not derived from these rows.
--
-- Does NOT fix the separate, non-data issue that the episode view still
-- attributes all 3 fees + both repayments to the still-open 10/20 advance
-- window (the view assumes sequential, non-overlapping advances; Cleo had
-- 3 open at once here) — see the filed GitHub issue for that.

begin;

delete from public.debt_adjustments
where id in ('e5b349e9-dd7f-48f8-b6ed-59cba6fa5f0a', 'bc931f1e-2917-4c8a-87f4-d53360175481');

commit;
