## ADR-064: Transfers Gain a Category Picker (Amends ADR-056)

Decision:
Add Transaction, Transfer mode, gains a category picker on the transfer as a
whole (one category applies to both the from- and to-account rows of the
pair — a transfer is one event, not two categorizable movements). Uses the
same visual style as other dropdowns in the app (larger, icon-based,
matching the Bill/Debt Type and Institution pickers per the ADR-054
shared-dialog visual pass) — not a plain `<select>`. `category_id` is
optional on transfers, consistent with how it's optional elsewhere.

Reason:
ADR-056 omitted categories from transfers on the assumption a transfer is
just money moving between the household's own accounts, not spending. In
practice households still want to tag transfers (e.g. "Savings goal," "Debt
payoff") for reporting alongside categorized spending, and every other
transaction type already has a categorized, icon-styled picker — leaving
transfers as the one uncategorized, unstyled exception was inconsistent
rather than intentional.

Status: Decided 2026-08-14. Implemented 2026-08-14.

