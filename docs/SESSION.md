## Session Notes

### ADR-059 — manual bill/debt allocations
- Step 1 DONE: `useSetAllocation()` extended with `billId`/`debtId` (exactly-one-target guard covers all four targets); `PayPeriodAllocation` type gained `bill_id`/`debt_id`. Existing category/goal callers unchanged and still valid. Files: `src/lib/income-hooks.ts`, `src/lib/supabase.ts`.
- Next: Step 2 — "Plan a bill/debt payment" action on the Paycheck Budget screen.
