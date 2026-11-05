## ADR-050: Obligation avatars and tap-to-reveal budget detail
Decision:
1. Bills, Debts and Accounts render a shared `ObligationIcon`: linked
   institution logo → institution-type icon/colour → name-derived emoji. The
   institution name is no longer repeated as text on Accounts rows.
2. Budget surfaces (Dashboard "Budget vs actual", Spending) lead with a single
   bar/ring summary; the ADR-034 spending-vs-bills split and the edit controls
   are revealed on tap rather than printed on every row.
3. Add Transaction's category list renders the ADR-029 icon + colour, and an
   unrecognised description offers inline institution creation with a favicon
   guessed from the merchant name.

Reason:
The lists were text-dense on phones and the ADR-034 split lines dominated rows
that are usually scanned, not read. Logos identify an obligation faster than a
repeated institution name, and capturing merchants at entry time builds the data
needed for a later spending-by-institution view without a schema change.

Status: Decided 2026-08-11. Implemented.

