## Session Notes

### ADR-059 — manual bill/debt allocations
- Step 1 DONE: `useSetAllocation()` extended with `billId`/`debtId` (exactly-one-target guard covers all four targets); `PayPeriodAllocation` type gained `bill_id`/`debt_id`. Existing category/goal callers unchanged and still valid. Files: `src/lib/income-hooks.ts`, `src/lib/supabase.ts`.
- Next: Step 2 — "Plan a bill/debt payment" action on the Paycheck Budget screen.
- Step 2 DONE: `PlanPaymentDialog` ("Plan a payment") added to the Paycheck Budget period view; writes a `pay_period_allocations` row with `bill_id`/`debt_id` via the extended hook. File: `src/routes/app.paycheck.tsx`.
- Step 3 DONE: new "Planned" card renders planned bill/debt rows (with Remove), visually distinct from and never deduplicated against "Due this period". File: `src/routes/app.paycheck.tsx`.
- Step 4 DONE: `allocated` (and therefore "Left to allocate", ADR-039) now includes `plannedTotal`. File: `src/routes/app.paycheck.tsx`.
- ADR-059 complete; `obligationsInRange()` and due-date bucketing untouched.

### ADR-060 — recurrence projection for forward pay periods
- Step 1 DONE: reused existing interval math — `shiftDate`/`advanceDate` in `src/lib/format.ts` (read-only variant `shiftDateSafe`); no new interval logic written.
- Step 2 DONE: `projectOccurrences(item, fromDate, throughDate)` added in `src/lib/paycheck-budget.ts`; pure and unit-testable, skips `one_time`, never returns the stored due date.
- Step 3 DONE: `obligationsInRange()` gained an optional `projectThrough` arg; projected dates bucket with the same half-open `start <= d < end` check and carry `projected: true`. Other callers (dashboard, snapshot) unchanged. Files: `src/lib/paycheck-budget.ts`.
- Step 4 DONE: Paycheck Budget "Due this period" rows show a dashed "Projected" badge with muted amount; projected amounts still count in obligations total and left-to-allocate. File: `src/routes/app.paycheck.tsx`.
- ADR-060 complete; computeArrears, stored due dates, and ADR-059 planning untouched.
