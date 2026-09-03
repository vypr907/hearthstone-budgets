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
  * Next: PR2 editable custom order, PR3 recommended-payment hint, PR4 lock+baseline.
