## Session Notes

### ADR-059 — manual bill/debt allocations
- Step 1 DONE: `useSetAllocation()` extended with `billId`/`debtId` (exactly-one-target guard covers all four targets); `PayPeriodAllocation` type gained `bill_id`/`debt_id`. Existing category/goal callers unchanged and still valid. Files: `src/lib/income-hooks.ts`, `src/lib/supabase.ts`.
- Next: Step 2 — "Plan a bill/debt payment" action on the Paycheck Budget screen.
- Step 2 DONE: `PlanPaymentDialog` ("Plan a payment") added to the Paycheck Budget period view; writes a `pay_period_allocations` row with `bill_id`/`debt_id` via the extended hook. File: `src/routes/app.paycheck.tsx`.
- Step 3 DONE: new "Planned" card renders planned bill/debt rows (with Remove), visually distinct from and never deduplicated against "Due this period". File: `src/routes/app.paycheck.tsx`.
- Step 4 DONE: `allocated` (and therefore "Left to allocate", ADR-039) now includes `plannedTotal`. File: `src/routes/app.paycheck.tsx`.
- ADR-059 complete; `obligationsInRange()` and due-date bucketing untouched.
