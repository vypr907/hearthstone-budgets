# Plan: Hide paid-off non-Advance debts outside the current pay period on Everything

## Goal
On the Everything screen, suppress debt rows that are already paid off unless the payoff date falls in the current pay period, or the debt is an `Advance` type (which can be re-used and reactivated).

## What will change

### Behaviour
- A debt row is hidden from the Everything list when **all** of the following are true:
  - `kind === "Debt"`
  - `debt_type !== "advance"`
  - `date_paid_off` is not null
  - `date_paid_off` is not inside the current pay period
- Bills are unaffected.
- Advance debts are always shown, even if `date_paid_off` is set, because they are reactivated on a new advance.
- The existing filters, sorting, and grouping continue to apply to the remaining rows.

### Implementation
1. Add a small helper `dateInPeriod(date: string, period: { start: string; end: string })` in `src/lib/pay-period.ts` (or reuse the existing `inRange` logic) so the check is consistent with how pay periods are already defined.
2. In `src/routes/app.everything.tsx`, when mapping debts to rows, compute a `paidOffOutsidePeriod` flag and skip adding the row when it is true.
3. The helper should treat the pay period as inclusive of start and end (same rule as `dueInPeriod`).

### Files
- `src/lib/pay-period.ts` — add/export `dateInPeriod` helper.
- `src/routes/app.everything.tsx` — filter out matching debt rows before sorting/grouping.

### Out of scope
- No schema changes.
- No changes to Bills, Debt detail, or the Debt list screens.
- No changes to how `date_paid_off` is set or cleared.

## Verification
- Build passes.
- If a test exists for Everything filtering, add a case for a paid-off non-Advance debt with a `date_paid_off` outside the current period.
- If no test exists, verify by inspecting the row-building logic in the code review.