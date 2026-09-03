# SESSION.md

## Session Notes

- ADR-094 PR1 — debt payoff engine correctness (no schema).
  `src/lib/debt-payoff.ts`: `activeDebts()` now excludes `debt_type='advance'`
  (case-insensitive) and sets `minimum` to `monthlyEquivalent(minimum_payment,
  billing_cycle, cycle_interval_days)` with a raw fallback; `orderFor` exported;
  new `strategyKeyOf()`. `payment-schedule.ts` imports the shared `orderFor`;
  `app.debt-strategy.tsx` + `app.payment-schedule.tsx` use `strategyKeyOf`;
  strategy screen got an advances/monthly-equiv footnote.
  * New `src/lib/debt-payoff.test.ts` (18 tests). Suite 124 → 142.
  * typecheck / build / test green; touched files lint-clean (repo-wide prettier
    debt in `app.payment-schedule.tsx` render JSX left alone — Issue #10).
  * **Known impact:** projected debt-free dates + interest on the Debt Strategy
    and Payment Schedule screens shifted (advances gone, biweekly minimums now
    counted at true monthly rate). Correction, not a regression.
  * Branch `feat/debt-payoff-engine-correctness` (also carries the deferred
    session-close doc housekeeping for PR #46 as its first commit).
  * Merged as PR #49 (squash `8f0d8cf`).
- ADR-094 PR2 — editable custom payoff order (no schema).
  * `useSaveDebtPriorityOrder()` (`data-hooks.ts`) — writes the shown debts'
    sequence as per-row `priority_order = 1..N` updates.
  * `DebtDialog` (`app.debts.tsx`) — new debts get `max(priority_order)+1` on
    INSERT only; edits never send the column.
  * `app.debt-strategy.tsx` — "Custom payoff order" card: up/down arrows over the
    active non-advance debts, "Save order" button, re-seeds from the DB only when
    the debt set changes so a local reorder survives.
  * `src/lib/reorder.ts` `move()` + 6 tests. Suite 142 → 148.
  * Verified against the TEST household via dev server + read-only MCP: reorder →
    `priority_order` `1,2,3` (advance stays `null`); new debt → `4`; edit → 1
    unchanged. Cleaned up the throwaway test debt.
  * Branch `feat/debt-custom-order-editor`. Opened as PR #50.
- ADR-094 PR3 — recommended-payment surface (no schema).
  * `src/lib/debt-recommended.ts` — `recommendedPaymentsThisCycle(debts, settings)`
    → per-debt `{ monthlyTarget, monthlyMinimum, rollover }` from
    `buildSchedule(plan, extra, strategy, 1)[0]`; `hasRecommendation()` gates the
    UI at `rollover > $0.01`; `useRecommendedPayments()` hook. Never stored.
  * `$X/mo min · $Y/mo plan` hint on Everything, Debts (list tile + detail
    dialog "Strategy target / mo"), and Paycheck Budget "Due this period" rows.
  * Paycheck Budget: one-tap "Plan $Y" on debt rows → `commitPlanned` writes the
    ADR-059 allocation (hidden once already planned); "Plan a payment" dialog
    prefills the amount from the strategy target.
  * `pay-flow.tsx` Submit/Clear dialog: "Recommended (plan / mo)" preset,
    shown only when the target exceeds "Owed this cycle". Its pre-existing
    non-conforming preset block got prettier-reformatted by the edit.
  * `obligationsInRange` / `obligationsTotalExcludingPlanned` / left-to-allocate
    untouched — hint is text-only, only the Planned row moves budget math.
  * New `src/lib/debt-recommended.test.ts` (6 tests). Suite 148 → 154.
  * typecheck / build / test green; new file lint-clean; routeTree.gen.ts build
    churn reverted. Docs (ADR-094, CHANGELOG, CONTEXT) updated.
  * Branch `feat/debt-recommended-payment` (stacked on PR2's `feat/debt-custom-order-editor`).
  * Merged: PR2 → PR #50 (squash `4195b25`), PR3 → PR #52 (squash `41df5a4`,
    rebased onto main; #51 auto-closed when #50's branch was deleted).
- ADR-094 PR4 = ADR-095 — strategy lock + baseline. **Design settled via
  interview** (freeze inputs + baseline snapshot; hard lock + Unlock; re-lock
  replaces baseline; keep paycheck-deduction debts in; keep biweekly
  monthly-equivalent; scoreboard on Debt Strategy + Dashboard + Payment
  Schedule; Payment Schedule follows the locked strategy).
  * ADR-095 written (docs/DECISIONS.md); SCHEMA.md updated.
  * Migration `scripts/migrations/2026-09-03-strategy-lock-baseline.sql`
    (+ `.verify.sql`) — 6 nullable columns on `debt_strategy_settings`,
    additive, no backfill, no RLS change.
  * **Blocked on the user running the SQL** in the Supabase SQL Editor, then
    the verify. Code (new `src/lib/strategy-lock.ts`, lock/unlock hooks, the
    three screens) is not started.
