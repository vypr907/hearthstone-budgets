## ADR-001: Use Supabase Instead of Lovable Cloud

Decision:
Use a separately managed Supabase project.

Reason:
The schema must remain inspectable, portable, and directly controlled.

## ADR-002: Shared Household Accounts

Decision:
Two users share one household dataset.

Reason:
The application models household finances rather than independent personal budgets.

## ADR-003: Transaction Ledger Model

Decision:
Transactions are the financial source of truth.

Reason:
Bills, debts, and balances are events that affect accounts.

## ADR-004: Android Only

Decision:
Build Android through Capacitor.

Reason:
The project goal is a native Android distribution workflow.

## ADR-005: Institutions Support Multiple Categories

Decision:
Replace institutions.category_id (single FK) with a join table, institution_categories
(institution_id, category_id), enabling many-to-many institution-to-category relationships.

Reason:
A single institution can reasonably span more than one spending category (e.g. a retailer
that's both "Pets" and "Household"). A single category_id column couldn't express that.

Status: Implemented 2026-07-28.


## ADR-006: Bills and Debts Reference Institutions, Not Accounts

Decision:
bills.institution_id and debts.institution_id both reference institutions(id). Neither
table has an account_id column.

Reason:
A bill or debt is often owed to an institution with no balance-bearing account underneath
it (e.g. Petco, a medical provider, a subscription). Requiring account_id would force one
to always exist, which doesn't match reality. Which account actually pays a given cycle is
tracked per-payment via transactions.account_id (through linked_bill_id/linked_debt_id),
not as a static field on bills/debts.

Status: Confirmed 2026-07-28 (documentation previously stated the opposite in error).

## ADR-007: Account Selection at Payment Time

Decision:
When marking a bill or debt as pending/cleared, the paying account is resolved at that
moment, not stored on bills/debts. If the linked institution has exactly one account,
auto-select it. If it has multiple accounts, prompt the user to choose. If it has zero
accounts, block the action and prompt the user to add one first.

Reason:
transactions.account_id is NOT NULL, but bills/debts intentionally have no account_id
(ADR-006), since an institution may have zero, one, or many accounts. This resolves that
gap without reopening ADR-006.

Status: Implemented 2026-07-28.

## ADR-008: Undo Is a Full Reversal

Decision:
"Undo" on a cleared bill or debt deletes the associated transactions row, resets
payment_status to 'unpaid', and reverts next_due_date (bills) / remaining_balance (debts)
to their pre-clear values.

Reason:
Undo is meant for correcting an accidental click, not recording a real reversed payment.
Treating it as "that clear never happened" is simpler and matches user intent. A genuine
reversal of real money already moved (e.g. a bounced payment) should be handled as a new
correcting transaction instead, not via Undo.

Note: this narrows Phase 3.5's original "transactions are permanent, never deleted" rule —
that rule still applies to normal history; Undo is the one intentional exception, scoped
only to reversing a same-session mis-click.

Status: Implemented 2026-07-28.

## ADR-009: Everything Checkbox Is Ledger-Aware, Not Status-Aware

Decision:
On the Everything screen, a bill/debt's checkbox reflects whether a 'cleared' transaction
exists for its current billing cycle — not whether payment_status literally equals 'cleared'.

Reason:
Clearing a bill automatically rolls payment_status back to 'unpaid' for the new cycle
(Phase 3.5 design) and advances next_due_date. A checkbox bound directly to payment_status
would always uncheck itself the instant a bill clears, which is correct under the hood but
looks broken to the user. Defining "checked" as "a cleared transaction exists dated within
the bill's current cycle window" keeps the checkbox meaningful without changing the
underlying rollover behavior on Bills/Debts.

Status: Implemented 2026-07-28.

## ADR-010: Everything Checkbox Cycles Through Submit-Then-Clear

Decision:
On the Everything screen, tapping a bill/debt's checkbox cycles it through the same states
as Bills/Debts: unpaid → pending → cleared. It does not jump straight to 'cleared' in one tap.

Reason:
Consistency with Bills/Debts' submit-then-clear semantics (Phase 3.5) outweighs the extra
tap. A one-tap "cleared" shortcut risks the same mismatch that caused earlier bugs in this
area — Everything having its own shortcut logic instead of sharing one real flow.

Status: Implemented 2026-07-28.

## ADR-011: Parent Category Stays a Text Column (For Now)

Decision:
categories.parent_category remains a plain text column. No parent_categories table
or join table is introduced at this time.

Reason:
Considered normalizing parent_category into its own table (parent_categories) with
categories.parent_category_id as an FK, to eliminate naming-drift bugs (e.g. the
"Gifts/Holidays" vs "Gifts & Holidays" mismatch hit during Phase 4 import) and to
support future parent-level metadata (color, icon, display order) for charts.

For a 2-person household app, the drift risk is adequately handled by the existing
pre-insert validation query (compare sheet parent labels against seeded
parent_category values before import) and is not frequent enough to justify a
migration right now. Chart/analysis grouping by parent_category already works fine
as a plain text `group by` — a join table adds no query capability that doesn't
already exist, only integrity and future metadata support.

Revisit when: parent category renames become frequent, or the "sell this as a
product" path (see PLAN.md's Future Add-On section) becomes real — multi-household
FK integrity matters more once other households' data is involved.

See PARENT_CATEGORY_MIGRATION.md for the exact steps to take when this is revisited.

### Spending groups use categories.parent_category as plain text
categories.parent_category is a text label, not a FK. Grouping on the Spending screen keys off the trimmed text ("Ungrouped" when empty) rather than looking up another categories row.

Status: Decided 2026-07-30. Not implemented.

## ADR-012: Ledger-derived spending actuals with manual fallback
Decision: A category's actual for a month is the sum of its negative transactions that month when any exist; otherwise the manually entered spending_actuals row is used. Ledger-derived cells are not editable inline.
Reason: Avoids double-counting and avoids retyping monthly totals for categories already tracked as transactions, while keeping manual entry for categories that are never itemised.
Status: Decided 2026-08-02. Implemented.

## ADR-013: Spendable balance definition
Decision: Combined spendable = accounts with is_spendable = true AND account_type in ('checking','credit'). 'savings', 'investment' and 'retirement' are excluded unconditionally. Balance per account uses the shared formula in src/lib/balances.ts.
Reason: is_spendable is a user-set flag that can be wrong on long-term accounts; the type exclusion is a hard guard.
Status: Decided 2026-08-02. Implemented.

## ADR-014: Manual transaction sign convention
Decision: In the quick-add transaction dialog a positive amount is stored as a negative (money out); a negative amount is stored as-is (money in).
Reason: Most manual entries are spending, and it keeps the form to the four requested fields with no extra direction toggle.
Status: Decided 2026-08-02. Implemented.

## ADR-015: Debt payoff projection engine
Decision: Simulate payoff month-by-month in the client (src/lib/debt-payoff.ts) rather than storing projections; when a debt has known_finance_charge, use it verbatim as that debt's total interest instead of the simulated figure.
Reason: Projections change with every balance/payment edit, so caching them invites staleness. Real loan/lease paperwork is more accurate than amortization estimates for those specific debts.
Status: Decided 2026-07-30. Implemented.

## ADR-016: `known_finance_charge` Redefined as Remaining Interest (Factor-Rate Debts Only)

Decision:
`known_finance_charge` represents interest still owed from today forward under a debt's
real fixed payment schedule — not the original total interest calculated at loan
origination. It is populated only for factor-rate/fixed-schedule debts where standard
`interest_rate`-based amortization doesn't apply (confirmed pattern: early payments are
disproportionately principal, later payments disproportionately interest, in a way
standard compounding doesn't produce). Standard-rate loans, credit cards, and
no-interest/no-agreement debts leave it null and rely on `interest_rate`.

Reason:
The field was originally set once at origination (total life-of-loan interest), which
double-counted interest already paid. This caused the payoff simulation to either finish
too early (paying off principal before the real finance charge was satisfied) or overshoot
(double-counting interest already paid), depending on which figure was used. Verified
against a real debt's payment history and live lender-site balance (Ticket 2).

Simulation change: for a debt with `known_finance_charge` set, the payoff simulation skips
`interest_rate`-based accrual entirely. That debt's simulated remaining cost is
`remaining_balance + known_finance_charge`, drained by minimum/extra payments the same as
any other debt.

Maintenance: this field goes stale every time a payment posts (interest paid reduces what's
left) — recalculate it after each payment on an affected debt, not just once at setup.

Formula:
```
known_finance_charge = (remaining_scheduled_payments − 1) × payment_amount
+ final_payment_amount
− remaining_balance
```

Status: Decided 2026-08-02. Implemented (see 'src/lib/debt-payoff.ts').