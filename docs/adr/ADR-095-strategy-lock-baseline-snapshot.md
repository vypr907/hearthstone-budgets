## ADR-095: Strategy lock + baseline snapshot

Decision:
The debt payoff strategy gets a per-household **lock**. `debt_strategy_settings`
gains six nullable columns (all default `null` = unlocked; unlocked behaviour is
unchanged from today):

| column | meaning |
|---|---|
| `strategy_locked_at timestamptz` | when the plan was locked; `null` = unlocked |
| `locked_strategy text` | `active_strategy` frozen at lock |
| `locked_extra_monthly_payment numeric` | `extra_monthly_payment` frozen at lock |
| `locked_priority_order jsonb` | array of debt-id strings — the Custom order frozen at lock |
| `baseline_debt_free_date date` | first-of-month of the projected payoff month, from `simulate(lockedInputs, balancesAtLock)` |
| `baseline_total_interest numeric` | projected total interest at lock |

1. **Lock** (Debt Strategy screen) writes all six from the current saved inputs
   plus one fresh `simulate()` run. Strategy must be saved first.
2. **Hard lock.** While `strategy_locked_at` is set, the strategy picker, the
   extra-payment field, "Save strategy", and the Custom payoff-order reorder card
   are disabled on the Debt Strategy screen. An **Unlock** button (confirm:
   "Unlocking clears your baseline comparison until you lock again") nulls all six
   columns.
3. **Re-lock overwrites** all six with a fresh snapshot — you only ever compare
   against your most recent decision.
4. **Scoreboard.** While locked, every projection consumer recomputes live using
   the *locked* inputs against *current* balances and compares:
   - live projected debt-free date vs `baseline_debt_free_date` → "On track" /
     "N mo ahead" / "N mo behind"
   - live total interest vs `baseline_total_interest`

   Shown on the **Debt Strategy screen** (full baseline card), the **Dashboard**
   Payoff Progress card (one line), and the **Payment Schedule** screen (a
   "plan locked to <strategy>" banner; the schedule renders the locked strategy
   and its own strategy-preview controls are hidden while locked).
5. **A debt added while locked** is appended to `locked_priority_order` and joins
   the live projection; the baseline scalars are never retro-adjusted (reality
   changed — that is the point of the scoreboard). A live sim that hits the
   600-month cap (`incomplete`) shows "—", not a delta.
6. New `src/lib/strategy-lock.ts`: `lockedInputs(settings)`,
   `baselineComparison(settings, debts)` → `{ status, monthsDelta, interestDelta,
   baselineDate, liveDate }`, `debtFreeDateFrom(months, from?)`. `useLockStrategy()`
   / `useUnlockStrategy()` hooks extend `useSaveDebtStrategySettings`'s upsert.
7. Paycheck-deduction debts stay in the projection (ADR-032 unchanged); biweekly
   minimums stay monthly-equivalent (ADR-094 PR1) — the sim remains a
   calendar-month grid.

`debt_strategy_settings` RLS is already household-scoped and the app already
UPDATEs the row (`useSaveDebtStrategySettings`); the new columns need no policy
change.

Reason:
The strategy screen is a live calculator with no memory — every knob touch moves
the debt-free date and nothing records "this is the plan I committed to." A lock
freezes the inputs so the projection has a stable reference; a two-scalar
baseline turns the screen into an ahead/behind scoreboard without the cost and
staleness of storing a whole month-by-month plan (rejected — see the interview).
ADR-015 forbids stored projections; `baseline_debt_free_date` /
`baseline_total_interest` are a deliberate, bounded exception — a historical
record of one decision, displayed only, never read back into engine math.

Status: Decided 2026-09-03. Implemented 2026-09-03 — migration
`scripts/migrations/2026-09-03-strategy-lock-baseline.sql` run + verified live
(6 nullable columns on `debt_strategy_settings`). `src/lib/strategy-lock.ts`
(`lockedInputs` / `computeBaseline` / `baselineComparison` / `applyLockedOrder`
/ `comparisonLabel` + date helpers), `useLockStrategy` / `useUnlockStrategy`
hooks, Lock/Unlock + baseline scoreboard on the Debt Strategy screen (controls
disabled while locked), a "Locked plan" line on the Dashboard Payoff Progress
card, and the Payment Schedule screen following the locked strategy/order.
`src/lib/debt-recommended.ts` (ADR-094 PR3) also projects from the frozen
inputs while locked. `src/lib/strategy-lock.test.ts` (14 tests). ADR-094 PR4.

