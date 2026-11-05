## ADR-094: Debt payoff engine correctness — advances, monthly-equivalent minimums, editable order, recommended payment

Decision:
Five related fixes to the client-side payoff engine (`src/lib/debt-payoff.ts`,
`src/lib/payment-schedule.ts`) and the screens that consume it. No schema change.

1. **Cash advances are excluded from the payoff plan.** `activeDebts()` filters
   out `debt_type = 'advance'` (case-insensitive, matching the DB trigger in
   `2026-09-01-enforce-debt-payoff-date.sql`). An advance's `minimum_payment`
   mirrors its full `remaining_balance`, so the simulation "paid it off" in
   month 1 and then rolled a phantom freed minimum onto the target debt every
   month after — a large false acceleration. Advances stay fully visible on the
   Debts and Everything screens and in obligation totals; they are simply not
   part of the amortisation projection.
2. **Sub-monthly minimums are fed in as their monthly equivalent.** The
   simulation is a calendar-month grid, so `DebtPlanInput.minimum` is now
   `monthlyEquivalent(minimum_payment, billing_cycle, cycle_interval_days)`
   (`src/lib/format.ts`, ADR-033/040; biweekly → ×2, quarterly → ÷3, custom uses
   the interval), with a raw per-cycle fallback when there is no monthly
   equivalent (one-time charges, interval-less custom). The entered biweekly
   values are confirmed per-paycheck amounts (e.g. "FM Jewelry" posts $270.82
   exactly twice, 14 days apart), so treating them as monthly understated real
   payoff power ~2×. **This shifts every projected debt-free date and interest
   total on the Debt Strategy and Payment Schedule screens** — a correction, not
   a regression; projections were always approximate and are never stored
   (ADR-015).
3. **`debts.priority_order` gains an app write path (PR2).** A reorder editor on
   the Debt Strategy screen writes a dense `1..N` over the shown active
   non-advance debts; `DebtDialog` auto-assigns `max(priority_order) + 1` on
   INSERT only. Paid-off / advance debts keep their stored value and are never
   ordered by the engine. Previously the column was set only by direct SQL.
4. **The strategy's recommended payment is surfaced (PR3).** A display-layer
   `recommendedPaymentsThisCycle(debts, settings)` returns, per debt,
   `{ monthlyTarget, monthlyMinimum, rollover }` derived from
   `buildSchedule(plan, extra, strategy, 1)[0]` — i.e. this calendar month's
   minimum plus any snowball rollover that lands on that debt. Surfaced as
   "`$X/mo min · $Y/mo plan`" beside the per-cycle minimum on the Everything,
   Debts and Paycheck Budget screens, only when `rollover > $0.01`; a one-tap
   "Plan $Y" on Paycheck Budget writes an ADR-059 `pay_period_allocations` row
   (ADR-071 then supersedes the auto amount); a "Recommended" preset is added to
   the Submit/Clear pay dialog. Not stored, recomputed every render (ADR-060);
   no new field on `Payable` or `CycleInfo`. `obligationsInRange` /
   `obligationsTotalExcludingPlanned` / left-to-allocate are deliberately
   untouched — the hint is pure text and only the Planned row moves budget math.
5. **Shared helpers.** `orderFor` is exported from `debt-payoff.ts` (it was
   duplicated verbatim in `payment-schedule.ts`); `strategyKeyOf(raw)`
   centralises the stored-string → `StrategyKey` coercion previously copy-pasted
   into both routes (unknown/legacy values → `avalanche`).

Paycheck-deduction debts (`is_paycheck_deduction = true`) stay in the plan
unchanged (ADR-032).

Reason:
The engine was double-counting advances and halving biweekly minimums, so the
projected debt-free date was not trustworthy. `priority_order` — the Custom
strategy's whole input — had no way to edit it in the app. The 12-month schedule
already computes the per-debt "should pay" figure but every screen except
Payment Schedule discarded it and showed only the raw minimum, hiding the point
of a snowball. The duplicated `orderFor` meant a filter change could silently
drift between the two screens.

Status: Decided 2026-09-03. Implemented 2026-09-03 — PR1: advance exclusion,
monthly-equivalent minimums, `orderFor` / `strategyKeyOf` refactor, engine unit
tests. PR2: editable `priority_order` (`useSaveDebtPriorityOrder` writes a dense
`1..N`; `DebtDialog` auto-assigns `max + 1` on INSERT; reorder card on the Debt
Strategy screen; `src/lib/reorder.ts`). PR3: recommended-payment surface —
`src/lib/debt-recommended.ts` (`recommendedPaymentsThisCycle` /
`useRecommendedPayments`, from `buildSchedule(...,1)[0]`), a "$X/mo min · $Y/mo
plan" hint on Everything / Debts / Paycheck Budget when `rollover > $0.01`, a
one-tap "Plan $Y" on Paycheck Budget rows (writes an ADR-059 allocation), and a
"Recommended" preset on the Submit/Clear pay dialog. `obligationsInRange` /
left-to-allocate untouched. No schema change.

