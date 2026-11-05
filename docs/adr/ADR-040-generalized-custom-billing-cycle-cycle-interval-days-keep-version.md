## ADR-040: Generalized Custom Billing Cycle (cycle_interval_days) KEEP VERSION

Decision:
Add `cycle_interval_days integer` to both `bills` and `debts`, used only when `billing_cycle = 'custom'`. Generalize the shared `advanceDate()`/`reverseDate()` helpers to accept a day-count for `custom` (reading `cycle_interval_days`) instead of only handling the fixed enum intervals. Generalize `monthlyEquivalent()` (src/lib/format.ts, ADR-033) the same way: for `custom`, `amount * (365.25 / cycle_interval_days) / 12`.

- No new `billing_cycle` enum values are added (e.g. no `every_4_weeks`) — any day-count cadence, current or future, is expressed via `custom` + `cycle_interval_days` instead of a growing enum. `bills.cycle_interval_days` and `debts cycle_interval_days` (integer, nullable) store a day count and are the only interval storage for `billing_cycle = 'custom'`.
- Forms show a number input + Days/Weeks toggle only when the cycle is Custom;
  weeks are multiplied by 7 before writing. Saving a custom bill/debt without a
  value is blocked. On edit the unit is derived from the stored day count
  (divisible by 7 and >= 7 -> Weeks, else Days) — no stored unit preference.
- `shiftDate()`/`advanceDate()`/`reverseDate()` take an optional `intervalDays`
  and add a `custom` branch shifting by that many days (same pattern as the
  14-day biweekly branch). A custom cycle with no interval throws
  `MissingCycleIntervalError` so the failure surfaces instead of silently
  no-op'ing; read-only/derivation paths use `shiftDateSafe()` which keeps the
  date unchanged rather than throwing mid-render.
- `monthlyEquivalent()` prorates custom cycles as
  `amount * (365.25 / cycle_interval_days) / 12`, returning null when unset.


Reason:
ADR-033 flagged `custom` as unprorated and non-advancing, with two options: add enum values per cadence, or generalize with a stored interval. Given more non-monthly cadences are expected (a 4-week subscription now, others later), the
interval column is the one-time fix — each new odd cadence becomes a data entry, not a schema/code change.

Schema change:
```sql
alter table bills add column cycle_interval_days integer;
alter table debts add column cycle_interval_days integer;
```

`cycle_interval_days` is nullable; required only when `billing_cycle = 'custom'`
(enforced in the UI form, not a DB constraint, consistent with existing
`is_variable_amount`-gated fields like `cycle_amount_due`).

Migration steps:
1. Run the SQL above.
2. Bill/debt form: when Billing Cycle = "Custom", show two inputs — a number field and
   a Days/Weeks unit selector. The stored cycle_interval_days is always in days: when
   the user picks "Weeks," multiply their entered number by 7 before saving (e.g. "4
   weeks" saves as 28). The unit selector is a UI-only convenience — cycle_interval_days
   remains the single source of truth, so editing an existing custom bill/debt shows
   whichever unit divides evenly (weeks if divisible by 7 and >= 7, else days), not a
   separately stored preference.
3. `advanceDate()`/`reverseDate()`: add a `custom` branch reading
   `cycle_interval_days` (fallback: treat missing value as an error state, not a silent no-op — a custom bill without an interval shouldn't advance).
4. `monthlyEquivalent()`: add the same `custom` branch.
5. Existing `custom` rows (if any) will have `cycle_interval_days = null` until
   edited — they keep today's non-advancing behavior until then, no backfill required.

Status: Decided 2026-08-06. Implemented.


