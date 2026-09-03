# Debt Payoff Engine

Client-side, recomputed on every render, **never stored** (ADR-015). Two entry
points share one set of rules:

- `simulate()` / `compareStrategies()` — `src/lib/debt-payoff.ts` — the Debt
  Strategy screen's "debt-free in / total interest / saved" comparison.
- `buildSchedule()` — `src/lib/payment-schedule.ts` — the Payment Schedule
  screen's next-12-months per-debt allocation. Also the source of the
  "recommended payment" figure (ADR-094).

## Inputs — `activeDebts(debts): DebtPlanInput[]`

A debt participates when it has a remaining balance, is not paid off, and is
**not** `debt_type = 'advance'` (ADR-094 — advances are short-cycle payroll
cash-outs that distort amortisation; still shown everywhere else).

| `DebtPlanInput` | from | notes |
|---|---|---|
| `balance` | `remaining_balance` | |
| `rate` | `interest_rate` | annual %, e.g. `29.24` |
| `minimum` | `monthlyEquivalent(minimum_payment, billing_cycle, cycle_interval_days)` | the sim is a monthly grid; biweekly → ×2, quarterly → ÷3, custom uses the interval; raw per-cycle fallback for one-time / interval-less custom (ADR-094) |
| `priority` | `priority_order ?? 1000 + index` | the Custom strategy's sort key; editable in-app (ADR-094) |
| `knownFinanceCharge` | `known_finance_charge` | factor-rate debts (ADR-016) |

## Ordering — `orderFor(strategy, debts)`

| strategy | sort | tie-break |
|---|---|---|
| `avalanche` | highest `rate` first | smallest `balance` |
| `snowball` | smallest `balance` first | highest `rate` |
| `custom` | ascending `priority` | smallest `balance` |

`strategyKeyOf(raw)` coerces the stored `debt_strategy_settings.active_strategy`
string (legacy / mixed-case / null) to a `StrategyKey`; anything unrecognized →
`avalanche`.

## Simulation loop (monthly, `MAX_MONTHS = 600`)

Each month, for open debts (`remaining > $0.005`):

1. **Accrue interest** — `remaining += remaining * (rate/100/12)`. Skipped
   entirely when `knownFinanceCharge` is set; that debt is drained at
   `balance + knownFinanceCharge` and its reported interest is that figure
   verbatim (ADR-016).
2. **Pay minimums** — `pool = Σ(all minimums) + max(0, extraMonthly)` (the sum is
   fixed for the whole run). Pay `min(minimum, remaining, pool)` on every open
   debt.
3. **Sweep the rest** — whatever is left in `pool` goes to open debts in
   strategy order, target first. A paid-off debt's minimum is never removed from
   `pool`, so it becomes freed firepower here — this is the "snowball rollover",
   with no explicit variable.

`incomplete = true` if the run hits `MAX_MONTHS` (e.g. a large balance against a
$1 placeholder minimum).

`compareStrategies(debts, extra)` runs `simulate` four times: a `minimumsOnly`
baseline (`simulate(debts, 0, "avalanche")`) plus the three strategies with the
real extra; `saved = minimumsOnly.totalInterest − strategy.totalInterest`.

## `buildSchedule(debts, extra, strategy, months = 12, start = new Date())`

Same loop, but accumulates each debt's paid amount per month into
`ScheduledPayment { debtId, name, amount, remaining, payoff }`. `schedule[0]` is
the current calendar month, so `schedule[0].payments[i].amount` is debt `i`'s
**recommended payment this month** (monthly-equivalent minimum + any rollover) —
see `src/lib/debt-recommended.ts` and ADR-094.

## Not modelled

Payment cycle timing / due dates, `opening_arrears` / `arrears_paid_to_date`,
`cycle_paid_to_date`, `on_payment_plan` schedules, and the actual ledger
transaction history. The projection starts from each debt's current
`remaining_balance`, which already reflects every real payment and adjustment.

## Persistence

`debt_strategy_settings` (one row per household): `active_strategy`,
`extra_monthly_payment`. Nothing about a projection is written back (ADR-015).
