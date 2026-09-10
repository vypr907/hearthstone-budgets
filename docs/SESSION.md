# SESSION.md

## Session Notes

- **Early-arrival paycheck splits (negative `day_offset`).** Wired the stack to
  support splits that land *before* the pay date, so a paycheck can be anchored
  on its official date while each split posts on its real bank date.
  - `src/lib/format.ts` — new `addDaysISO(date, days)` helper (local-component
    date math, negatives allowed); `format.test.ts` covers it.
  - `src/lib/income-hooks.ts` — `useMarkIncomeReceived`: `shift()` now uses
    `addDaysISO` (the old `toISOString()` path could drift a day once an offset
    was non-zero); every auto-created deposit **and** deduction row now sets
    `cleared_date` (ADR-100 regression — this writer was the one
    `status:'cleared'` path that never set it).
  - `src/routes/app.income-source.$id.tsx` — `SplitDialog`: field relabelled
    "Days relative to pay date", helper text for negatives, writes `day_offset:
    0` not `null` when blank; row summary reads "Nd early" / "Nd late".
  - `src/routes/app.paycheck.tsx` — read-only deposit-splits card: same
    "Nd early / late" wording.
  - Docs: ADR-047 addendum (2026-09-10); `income_source_splits` table added to
    SCHEMA.md (was undocumented); TODO.md limitation re: `transaction_date`
    bucketing of early splits.
  - No schema change. `tsc --noEmit` clean, `npm run build` clean, `vitest run`
    190 pass (5 new for `addDaysISO`).
  - Known issue: 7 pre-existing null-`cleared_date` rows from the 2026-09-10
    ASRC paycheck are not backfilled by this change (harmless — balances fall
    back to `transaction_date`).
  - Next step: user sets ASRC Federal splits to `day_offset` −2 / −2 / −1 in the
    app and starts dating ASRC pay events on the official Friday; optional
    verification pass against the TEST household per the plan.
