## Session Notes
- [x] ADR-044 split transactions: `split_group_id` on Transaction type, save/delete
      split hooks, `SplitLinesEditor`, split toggle in Add Transaction, grouped
      display (Transactions screen + Accounts recent activity), whole-group edit
      dialog (delete + re-insert on save).
- [x] ADR-045 invoices + adjustments: `debt_type` is now a dropdown including
      Invoice, Institution dropdown added to the Debt form, and an Adjustments
      section on debt detail (add dialog + per-row delete, payable-first balance
      write ordering).
- [x] Shared `InstitutionDialog` component (type dropdown, category multi-select,
      linked-accounts list) reused inline by the Debt form's
      "+ Add new institution" option.

- [x] ADR-046 payment fees: optional Fee field in the pay prompt; writes a second,
      unlinked transaction ("Fee: <name>") on the same account using the household
      "Fees" category when one exists. Never credits the cycle.
- [x] ADR-047 mark income received: "Mark received" button on each pay date writes
      the source's deposit splits (fixed rows + remainder absorbing variance,
      day_offset applied) as cleared transactions grouped by `split_group_id`.
- [x] Shared `AccountDialog` component (now with an Institution picker); the
      Institution form gained an inline "+ Add account" action.
- [x] Bill form: "+ Add new institution" option, matching the Debt form.
- [x] app.institutions.tsx now uses the shared `InstitutionDialog`.

### Known issues
- ADR-047: when an income source has no split rows, marking received updates the
  event but writes no deposit transaction (no account prompt yet).
- Institutions and Accounts screens still define their own detail dialogs; only the
  add/edit forms are shared.
