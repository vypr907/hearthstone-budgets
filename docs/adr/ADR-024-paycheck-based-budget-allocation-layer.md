## ADR-024: Paycheck-Based Budget Allocation Layer

Decision:
Add a new planning layer parallel to monthly `spending_budgets`/`spending_actuals`, built
around the household's primary income source:

- `income_sources`: recurring/irregular income streams. Exactly one may have `is_primary = true`
  (enforced by partial unique index).
- `income_source_splits`: template for how one primary paycheck deposits across multiple
  accounts on different days (fixed amounts + one remainder split, each with a day_offset from
  the pay date).
- `income_events`: one actual/expected occurrence of any income source (primary or secondary).
- `pay_period_allocations`: slider-based category allocations, keyed to a primary income_event.

Bill/debt-to-paycheck assignment is NOT stored. A period's obligations are computed live as
whichever bills/debts have an effective due date falling within
`[event.expected_date, next primary event's expected_date)`, reusing existing due-date logic
(`debtDueDate()`, bill cycle fields). Secondary income (ANG, UberEats, future second income)
adds to whichever primary period's date range it falls into — it never creates its own
obligation bucket.

The "bottom number" for a period = primary amount + secondary income in range − obligations
in range − sum(allocations) — computed live, never cached.

Paycheck-level planning uses income_sources / income_events / pay_period_allocations
on its own screen; spending_budgets and spending_actuals are untouched. A pay period runs from a
primary income_event's effective date up to (exclusive) the next primary event, or +14 days when
none exists. Allocations are keyed on income_event_id + category_id and stored per household.

Reason:
Obligation timing can't be derived from a fixed cadence (ANG's date moves monthly, UberEats
has none), so auto-assignment must be date-range-based and computed at read time — consistent
with ADR-015's rule that anything which changes on every edit shouldn't be cached. Splitting
one paycheck across 3 accounts on different days is a real, recurring shape (ASRC → SoFi/One/
USAA), not a one-off, so it's modeled as a reusable per-source template rather than one-off
manual entries each period.

Monthly budgets and per-paycheck cash allocation answer different questions; merging them
would overload the Spending screen and its month-locking flow.

This is additive only — `spending_budgets`/`spending_actuals` and all Bills/Debts logic are
unchanged. Some months have 2–3 primary paychecks; this layer handles that naturally since
periods are derived from actual `income_events`, not a fixed monthly bucket.

Known limitation: no manual override yet for "pay this bill from a different check than its
due-date range implies." Due-date-in-range is the only assignment rule for now.

Status: Decided 2026-08-03. Implemented.
### Open Question — Future Cross-Reference (not yet decided)

Two items surfaced while comparing this ADR against reference-app screenshots
(2026-08-03). Neither requires action now; both should be revisited at the
noted trigger point.

**1. Stored bill→paycheck override (vs. current date-range-only assignment)**
Reference apps store an explicit "which paycheck pays this bill" tag per bill,
rather than deriving it from due-date-in-range. This is the same gap already
named in this ADR's "Known limitation." Two options if it becomes a real need:
- Add an optional `bills.forced_income_event_id` override column, checked
  before falling back to date-range logic, or
- Treat a wrong assignment as a due-date data problem (fix the bill's date)
  rather than adding an override mechanism.
Revisit when: date-range misassignment actually happens in practice, not
speculatively.

**2. Allocations may eventually need to target savings goals, not just categories**
Reference apps let one "distribute paycheck" action fill both spending
categories and savings goals in the same flow. `pay_period_allocations`
currently only supports `category_id`. Once ADR-025 (Savings Goals) is
implemented, decide between:
- Adding a nullable `goal_id` to `pay_period_allocations` alongside
  `category_id` (mutually exclusive — exactly one set per row), or
- Keeping goal contributions purely in the transactions ledger via
  `linked_goal_id` (ADR-025), with no representation in the pay-period
  allocation/planning layer at all.
Revisit when: ADR-026 is implemented and this becomes a concrete UX decision.


