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

### Correction 2026-08-03: Account Resolution Is Household-Wide, Not Institution-Scoped

The original decision blocked payment when the bill/debt's own institution had zero
accounts underneath it. This assumed every institution eventually gets an account,
which is false for vendor/subscription institutions (Starz, utilities, etc.) that are
never balance-bearing — the paying account always belongs to a different institution
(a bank or credit card).

Revised behavior: when marking a bill/debt pending, prompt for the paying account
from the full list of household accounts (not filtered by the bill's institution).
Default the selection to whichever account last paid this specific bill/debt (most
recent transactions.account_id for that linked_bill_id/linked_debt_id), falling back
to no default if there's no payment history yet. Never block on "institution has zero
accounts" — that condition is expected and normal for most institutions.

Correction Status: Decided 2026-08-03. Implemented 2026-08-03.

Status: Implemented 2026-07-28.

