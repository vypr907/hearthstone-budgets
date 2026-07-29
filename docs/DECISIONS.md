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