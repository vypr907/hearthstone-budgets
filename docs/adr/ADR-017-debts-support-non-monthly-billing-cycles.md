## ADR-017: Debts Support Non-Monthly Billing Cycles

Decision:
`debts.billing_cycle` and `debts.next_due_date` (both already present in the schema, previously
unused) are now surfaced and editable in the app, and drive scheduling for any debt that isn't
monthly. When `billing_cycle` is `'monthly'`, the existing `due_day`-based flow is unchanged.
When it's anything else (e.g. `'biweekly'`), `next_due_date` is used instead of `due_day` to
determine overdue status and Dashboard listing, and advances by the billing_cycle interval on
clear — reusing the same cycle-advance logic already built for bills, rather than a second copy.

Reason:
Phase 3 assumed all debts reset monthly. In practice, several debts (paycheck-deduction loans,
a payment-plan credit card) are on a biweekly schedule. The columns needed to support this
already existed but were never wired into the UI or the clear/reset logic.

Data correction applied:
```sql
update debts set next_due_date = '2026-07-30' where name = 'GTC';
update debts set next_due_date = '2026-08-01' where name = 'TSP Loan';
update debts set next_due_date = '2026-07-30' where name = 'Schwab Loan';
update debts set billing_cycle = 'biweekly' where name in ('GTC', 'TSP Loan', 'Schwab Loan');
```

Note: GTC is a payment-plan debt being paid off and closed, not a recurring biweekly bill —
no special handling needed; once `remaining_balance` reaches 0 it naturally drops out of the
payoff simulation and active-debt views via the existing `remaining_balance > 0` filter.

### From Lovable update:
Decision: Monthly debts continue using `due_day`; any other `billing_cycle` uses `next_due_date`
for display, editing, overdue checks, and cycle roll-forward. A single helper `debtDueDate()`
resolves a debt's effective due date, and clearing/undo reuse the bill helpers
`advanceDate()`/`reverseDate()`.

Reason: Most debts are monthly with a stable day-of-month, but leases/loans on other cadences
need a real date. Reusing the bill cycle helpers avoids duplicating interval math.

Status: Decided 2026-07-31. Implemented.


### Correction to ADR-017: due_day Must Be Nullable

Decision: debts.due_day is changed from not null to nullable.

Reason: ADR-017 established that non-monthly debts (biweekly, quarterly, custom, etc.) use next_due_date instead of due_day, with only monthly debts keeping due_day. The original Phase 1 schema, however, created due_day as not null, and no migration ever relaxed it when ADR-017 shipped — so the app correctly omits due_day for a non-monthly debt, but Postgres still rejects the insert. Same category of gap as ADR-048's correction to starting_balance (invoices don't have one, so that NOT NULL had to be dropped too); due_day simply never got the equivalent fix at the time.

Found 2026-08-12: creating an Advance-type debt on a biweekly cycle failed with null value in column "due_day" violates not-null constraint.

Migration:

```sql
alter table public.debts alter column due_day drop not null;
notify pgrst, 'reload schema';
```

No app code change required — the debt form already omits due_day for non-monthly cycles per ADR-017; only the database was out of sync.

Status: Decided 2026-08-12. SQL ready to run.

---

