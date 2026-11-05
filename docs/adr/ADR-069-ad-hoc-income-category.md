## ADR-069: Ad-Hoc Income Category

Decision:
Extend `categories.domain` from `'bill' | 'debt' | 'spending'` to a 4th value, `'income'`.
Scope is ad-hoc income only — side income, reimbursements, credits, gifts received — fully
separate from `income_sources` and the structured pay-period engine (ADR-055 and related),
which this does not touch.

Four new categories created under `domain = 'income'`: **Income, Credit, Refund, Gift**.

Before this ships, audit existing domain-filtered queries to confirm they're safe with a
4th value — Dashboard category grid totals, `spending_budgets`/`spending_actuals` (must
explicitly filter `domain = 'spending'` rather than assuming "not bill/debt"), and the
category picker in Add Transaction.

Backfill: existing transactions that are positive-amount and currently miscategorized
get re-tagged into the matching new income category. Source category IDs (e.g. the
existing "Gifts" category) need to be confirmed live via Supabase SQL Editor before the
backfill script is written — not assumed from documentation.

Reason:
A 4th domain value keeps one source of truth for category type instead of adding a
parallel flag. Scoping this to ad-hoc income only, and explicitly not touching
`income_sources`, avoids collision with ADR-055's gross/net deduction logic.

Schema:
```sql
alter table categories drop constraint categories_domain_check;
alter table categories add constraint categories_domain_check
  check (domain in ('bill','debt','spending','income'));

insert into categories (household_id, name, domain) values
  ('<household_id>', 'Income', 'income'),
  ('<household_id>', 'Credit', 'income'),
  ('<household_id>', 'Refund', 'income'),
  ('<household_id>', 'Gift', 'income');
```

Status: Decided 2026-08-18. Not yet implemented — domain-filtered query audit and backfill
source-category confirmation are prerequisites before running the SQL above.

## ADR-069: Ad-Hoc Income Category (continued — required code changes)

Audit finding (2026-08-18): No domain filtering exists anywhere in the frontend today.
`useCategories()`, `useSpendingBudgets()`, `useSpendingActuals()` filter only on
`household_id`. Dashboard budget grid, Spending screen, `buildActualResolver()`, and the
Add Transaction category picker are all driven purely by presence of a `spending_budgets`
row or a transaction's `category_id` — none check `domain`. Introducing `domain = 'income'`
without code changes would let a `spending_budgets` row exist against "Gift" or "Credit"
and surface it in the Dashboard/Spending grids identically to a real spending category, and
would offer income categories in the spending-entry picker.

Required changes (Lovable-ready prompt, reference ADR-069, do not create a new ADR):

1. `useCategories()` (src/lib/data-hooks.ts) — add an optional `domain` filter param so
   callers can request `domain = 'spending'` explicitly rather than relying on absence of
   a filter.
2. Add Transaction category picker (src/components/AddTransactionFab.tsx:142-145) — filter
   `sortedCategories` by `domain === 'spending'` for expense entries; income categories
   should only appear when the transaction being entered is income (positive amount /
   explicit "Income" entry mode — exact UX for how a user signals "this is income" needs a
   decision, see open question below).
3. Dashboard budget grid (src/routes/app.index.tsx:193-236) and Spending screen
   (src/routes/app.spending.tsx:154-156) — both currently iterate `spending_budgets` rows
   unconditionally. Add a join/filter so only rows where the linked category has
   `domain = 'spending'` are included. This also implies: creating a `spending_budgets` row
   against an income category should be prevented at the source, not just filtered at
   display time — otherwise stray budget rows accumulate silently.
4. `buildActualResolver()` / `billsBudgetedByCategory()` (src/lib/spending-actuals.ts) —
   currently filters only by `amount < 0`. Should also exclude `domain = 'income'`
   categories explicitly rather than relying on the sign check as an incidental filter.

Open question (needs your decision before Lovable prompt is finalized): how does a user
signal "this transaction is income" in Add Transaction — a separate entry mode/toggle, or
just picking an income-domain category and the amount sign is inferred? This affects #2
directly.

Reason:
The domain column alone does nothing without consumers respecting it — this was flagged
as a prerequisite in the original ADR-069 draft and the audit confirms it's required, not
optional, before the schema migration ships.

Status: Audit complete 2026-08-18. Code changes not yet implemented. Schema migration
(domain constraint + 4 category inserts) should not run until Lovable has this prompt
staffed, to avoid a window where income categories exist but nothing respects them.

