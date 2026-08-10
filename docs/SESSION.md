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

### Remaining from this batch
- [ ] ADR-046 payment fees (optional Fee field in pay-flow.tsx → second unlinked
      transaction row using the household "Fees" category).
- [ ] ADR-047 mark income received → auto-create split transactions from
      income_source_splits.
- [ ] Institution form: "+ Add account" action inline (list is shown; add action
      still points users at the Accounts screen).
- [ ] Bill form: "+ Add new institution" option (done for Debts only so far).
- [ ] Migrate app.institutions.tsx to use the shared InstitutionDialog.
