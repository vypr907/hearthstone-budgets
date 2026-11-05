## ADR-041: Manual Override for Spending Actuals (amends ADR-012)

Decision:
`spending_actuals.is_manual_override boolean default false` decides which value a Spending cell shows. Every `actual_amount` cell is editable, for any month, whether or not transactions exist. Rendering priority per (category_id, month): manual override wins; else the ledger sum of that category's transactions that month (ADR-012); else the stored `actual_amount`.

- Saving an edit writes `actual_amount` and sets `is_manual_override = true`. It never creates, edits, or deletes `transactions` rows.
- Editing a cell that is currently ledger-derived (override false + transactions exist) first shows a one-time confirm dialog; cancel makes no change.
- Overridden cells show a pencil indicator that doubles as a revert action: it sets `is_manual_override = false`, keeping the stored `actual_amount` but restoring ledger-derived-first display.

Reason:
ADR-012 locked cells whenever transactions existed, so a partially-logged month could never be corrected to the real total. The override flag keeps the ledger as the default source of truth while letting a human total win when they say so.

Status: Decided 2026-08-06. Override mechanism implemented 2026-08-06. Month
navigation (prev/next arrows above the category list, defaulting to the current
calendar month, with "Start new month" still anchored to the ledger's newest
month) implemented 2026-08-06 — the edit/override flow applies to the selected
month.

### ADR-041 addendum (2026-08-27): "Start new month" is not a lock

"Start new month" (`useStartNewSpendingMonth`) only inserts zeroed
`spending_actuals` rows for the *next* month. It never freezes, locks, or
overrides any prior-month row — prior months stay ledger-derived and every cell
stays editable (subject only to the per-cell `is_manual_override` above, which a
human sets and can revert). UI copy must not describe a rolled-past month as
"locked". The toast now reads "Now budgeting <next> · earlier months stay
editable"; the override confirm dialog says the override is for that month only
and is reversible via the pencil control. No behaviour change — copy only.



