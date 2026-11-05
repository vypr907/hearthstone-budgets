## ADR-018: Variable-Amount Bills Prompt for Actual Amount at Payment Time

Decision:
When marking a bill as pending (submitted), the app prompts for the actual amount owed this
cycle, defaulting to `bills.amount` as a starting value. The entered amount — not the stored
`bills.amount` — is what gets used for the resulting `transactions` row. `bills.amount` itself
is left unchanged unless the user explicitly edits it separately; it continues to represent a
typical/budgeted amount, not necessarily this cycle's exact bill.

Reason:
`bills.amount` is a single fixed value, and the existing mark-paid flow always submits that
stored amount as the transaction amount. This is correct for fixed bills (rent, subscriptions)
but wrong for variable bills (electric, phone) whose real amount changes month to month —
every payment would silently log the wrong figure. Since quick manual transaction entry
(Phase 4.5) already asks the user for an amount at entry time, prompting for the actual amount
at bill-payment time keeps the same interaction pattern rather than introducing a new one.

Status: Decided 2026-07-31. Not yet implemented.

