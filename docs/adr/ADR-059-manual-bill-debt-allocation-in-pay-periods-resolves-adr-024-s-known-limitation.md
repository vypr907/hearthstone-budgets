## ADR-059: Manual Bill/Debt Allocation in Pay Periods (Resolves ADR-024's Known Limitation)

Decision:
Extend `pay_period_allocations` with two new nullable columns, `bill_id` and
`debt_id`, alongside the existing `category_id`/`goal_id`. The existing
check constraint (exactly one of category_id/goal_id set, per ADR-039) is
replaced with one requiring exactly one of the four to be set — a row
allocates to a category, a goal, a bill, or a debt, never more than one.

The Paycheck Budget screen gains a way to manually plan an amount toward a
specific bill/debt for a specific pay period, independent of that item's
`next_due_date`. This is additive to, not a replacement for, the existing
automatic due-date bucketing (`obligationsInRange()`, ADR-024):

- **Auto-matched items** (today's behavior, unchanged): a bill/debt whose
  effective due date falls inside the period shows in "Due this period" —
  labeled as due.
- **Manually planned items** (new): any bill/debt with a
  `pay_period_allocations` row for this period shows in a second, clearly
  separate section — labeled "Planned," not "Due" — with the manually
  entered amount, regardless of what the due date says. An item can appear
  in both sections at once if it happens to be both due and separately
  planned; they are not deduplicated against each other, since "due" and
  "planned" answer different questions.

This does not change how due-date bucketing itself works for ordinary
bills — nothing about an unflagged bill's forecast changes. Only bills/debts
the household chooses to plan manually (via a `pay_period_allocations` row)
gain the second section.

Reason:
Some obligations don't have a predictable due-date-to-paycheck mapping —
most concretely, rent paid via a third-party split service (Flex) whose
per-paycheck split amount is decided after the fact and can't be derived
from a stored due date. ADR-024 already logged this as an open limitation
("no manual override for which paycheck pays this bill... revisit when
misassignment actually happens in practice"). It has now happened in
practice. Reusing `pay_period_allocations` (already the mechanism for
manually directing paycheck money toward a category or goal, per
ADR-024/039) for a bill/debt target is the same pattern a third time, not a
new concept — consistent with "reuse before create."

This intentionally does NOT attempt to auto-predict a split. The household
sets the planned amount by hand, per period, based on their own current
expectation (which may be "I don't know yet" — leave it blank, nothing
forces a value). The ledger — not this forecast — remains the source of
truth for what actually happened, via existing bill-linked transaction
filtering (Group 7).

Schema change:
```sql
alter table pay_period_allocations add column if not exists bill_id uuid references bills(id);
alter table pay_period_allocations add column if not exists debt_id uuid references debts(id);
```

The existing check constraint from ADR-039 needs to be replaced. Its exact
name is auto-generated and not recorded in this doc — **inspect it first**
before dropping anything:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'pay_period_allocations'::regclass and contype = 'c';
```
Then drop that constraint by its real name and add:
```sql
alter table pay_period_allocations add constraint pay_period_allocations_exactly_one_target
  check (
    (category_id is not null)::int +
    (goal_id is not null)::int +
    (bill_id is not null)::int +
    (debt_id is not null)::int = 1
  );
```

Migration steps:
1. Run the inspection query, confirm the existing constraint name, then run
   the column additions + constraint swap in the Supabase SQL Editor.
2. `useSetAllocation()` (src/lib/income-hooks.ts or wherever it lives per
   ADR-039) gains `billId`/`debtId` parameters alongside `categoryId`/
   `goalId`, with the same "exactly one, reject both/neither client-side"
   guard already used for the category/goal case.
3. Paycheck Budget screen: add a "Plan a bill/debt payment" action — pick a
   bill or debt, enter a planned amount for this period. Shows as a new row
   in a "Planned" section, visually distinct from the existing "Due this
   period" section (different label/accent, not merged into one list).
4. No change to `obligationsInRange()` or the existing auto-matched due-date
   logic — this is purely additive.

Status: Decided 2026-08-12. Not yet implemented — SQL pending your review/run.

