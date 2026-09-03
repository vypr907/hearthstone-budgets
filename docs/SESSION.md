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
  * Branch `feat/debt-custom-order-editor`.
  * Next: PR3 recommended-payment hint + one-tap plan + pay preset; PR4 lock+baseline.
