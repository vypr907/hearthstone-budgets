# ADR-069: Ad-Hoc Income Category

Scoped to ad-hoc income (side income, reimbursements, refunds, gifts). No changes to income sources, deductions, or pay-period logic.

The four income categories (Income, Credit, Refund, Gift) don't exist yet — everything below must behave exactly as today while `domain='income'` rows are absent.

## 1. Domain-aware category hook

`useCategories()` gains an optional domain argument: `useCategories("spending")`. It stays valid with no arguments (returns everything, current behavior for the ~15 callers not being changed). Filtering is applied in the query with the domain in the query key, matched case-insensitively and trimmed, consistent with how the Paycheck screen already compares `domain`.

## 2. Add Transaction: explicit Income mode

The mode row currently reads `Expense | Transfer`. It becomes `Expense | Income | Transfer`.

- Expense mode: category dropdown lists only `domain='spending'` categories (today it lists all).
- Income mode: same form fields as Expense (account, amount, date, status, place, description, optional bill/debt link is hidden), but the category dropdown lists only `domain='income'` categories, the amount label reads "Amount received", and the saved amount is stored positive (money in). Split toggle is hidden in income mode.
- Transfer mode: unchanged, except its optional category picker also narrows to `domain='spending'` (it's a household movement, not income).
- Mode is user-chosen; the amount sign never infers it.

Until the migration runs, Income mode's dropdown will simply be empty — an inline hint tells the user no income categories exist yet.

## 3. Dashboard budget grid

The grid iterates every `spending_budgets` row. It will skip rows whose linked category is missing or whose category domain is not `'spending'`, so a stray budget against an income category can never appear.

## 4. Spending screen groups

Same filter applied to `budgets.filter((b) => !!b.category_id)`. The category picker used to add a new budget row also narrows to `domain='spending'`.

## 5. spending-actuals: explicit income exclusion

`buildActualResolver()` and `billsBudgetedByCategory()` currently rely on `amount < 0` as an incidental filter. Both gain an optional categories list and explicitly skip any transaction or bill whose category has `domain='income'`, in addition to the existing sign check. Callers (Dashboard, Spending) pass their already-loaded category list; with no list passed, behavior is identical to today.

## 6. Block income budgets at the write path

`useUpsertSpendingBudget()` verifies the target category's domain before insert/update and throws a clear error if it is `'income'`. The Spending screen surfaces that as a toast. This prevents invisible rows rather than relying on display-time filtering.

## Docs

Update `docs/SESSION.md` (work entry), `docs/DECISIONS.md` (append implementation notes to ADR-069 — no new ADR), and `docs/TODO.md` with the pending SQL migration: add the `income` domain value plus the four categories, to be run manually after this ships.

## Not touched

`income_sources`, `income_source_deductions`, pay-period allocation, ADR-055/ADR-068 flows, bill/debt category pickers.
