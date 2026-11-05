## ADR-020: 12-month payment schedule and dashboard charts
Decision:
`src/lib/payment-schedule.ts` reuses the payoff simulation rules (minimums on every open
debt, extra + freed minimums rolled onto the top-ranked debt) to emit a per-month allocation
for the next 12 months, driven by `debt_strategy_settings.active_strategy` and
`extra_monthly_payment`. Month check-offs write to an optional
`payment_schedule_checkoffs (household_id, month)` table; when that table does not exist the
hook silently falls back to device-local storage so the screen still works.
`src/lib/net-worth.ts` owns `balanceAsOf()` — most recent snapshot on or before the date
(else `starting_balance`) plus cleared transactions between that snapshot and the date —
and the 6-month trend grouped by `account_type`.

Reason:
The schedule must agree with the Debt Strategy projection, so both consume the same ordering
and rollover rules. Net-worth history needs a point-in-time balance rule distinct from
`src/lib/balances.ts` (which only computes "now"), so it lives in its own module.
Check-off state is household-shared data, but no table exists yet in the connected Supabase
project; the fallback avoids blocking the feature on a manual migration.

Status: Decided 2026-07-31. Implemented.

