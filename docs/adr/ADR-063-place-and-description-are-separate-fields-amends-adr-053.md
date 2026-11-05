## ADR-063: Place and Description Are Separate Fields (Amends ADR-053)

Decision:
Add Transaction gains two distinct fields where ADR-053 used one:
- **Place**: the existing institution search/inline-create picker
  (autocomplete-as-you-type, one-tap link, inline "+ Add new institution"),
  unchanged in behavior — only moved off the Description field.
- **Description**: a plain free-text field for an optional note, independent
  of place matching.

`transactions.institution_id` and `transactions.description` keep their
current meaning and storage — this is a UI field-mapping change only, no
schema change, no change to how institution matching/creation works.

Reason:
ADR-053 tied place-matching to the Description field to avoid slowing quick
entry, but in practice it prevents adding any actual note when a place is
also being set, and conflates two different kinds of information. Splitting
them costs one extra field, not new matching logic.

Status: Decided 2026-08-14. Implemented 2026-08-14. 2026-08-17 addendum: the
Transactions list row, its detail dialog title, and Accounts' Recent Activity
row now title a manual/generic transaction (no linked_bill_id/linked_debt_id,
no "Fee: " description) from its place — institution_id set + empty
description → place alone; institution_id set + non-empty description →
"<Place> · <Description>" with the description rendered subdued
(`text-muted-foreground`, italic, smaller); institution_id null → unchanged
(`description || "Transaction"`). Fee/Bill payment/Debt payment titles are
untouched — those descriptions already never fall back and are excluded by
the linked-id/"Fee: " gate. New shared `TransactionTitle` component in
`src/components/TransactionTitle.tsx`, used by
`src/routes/app.transactions.tsx` and `src/routes/app.accounts.tsx`. UI-only,
no schema change.

---

