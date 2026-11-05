## ADR-039: Savings Goals in Pay Period Allocations (Resolves ADR-024 Open Question)

Decision:
Add `pay_period_allocations.goal_id uuid references savings_goals(id)` (nullable).
`category_id` becomes nullable. Exactly one of `category_id` / `goal_id` must be set,
enforced by a check constraint — a row allocates to a spending category OR a savings
goal, never both. The Paycheck Budget allocation screen gains goal rows alongside
category rows, using the same slider/input UI, writing to goal_id instead of category_id.

Reason:
Resolves the open question logged in ADR-024's cross-reference note: households want to
manually direct extra paycheck money into a specific savings goal (e.g. an envelope) in
the same screen where they already allocate to spending categories, rather than only
being able to fund goals through the separate Add/Withdraw action.

Status: Decided 2026-08-05. Implemented 2026-08-05. `useSetAllocation()` takes
`categoryId` OR `goalId` and rejects both/neither client-side before the DB check
constraint fires; the period "Left to allocate" figure counts goal rows alongside
category rows.

