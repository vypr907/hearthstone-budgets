## ADR-045: Invoices Reuse debts; New debt_adjustments Table for Non-Payment Balance Changes

Decision:
Invoices are debts with `debt_type = 'invoice'` (added to the existing debt_type
values) — no new table for the entity itself. `interest_rate`, `minimum_payment`,
`priority_order`, and the payoff-strategy calculator are simply left at their
defaults/unused for invoice-type debts; nothing about the schema forces those fields.

Add `debt_adjustments`: a signed, non-payment change to a debt's remaining_balance —
insurance coverage, an insurance discount, a late fee, an NSF fee, or similar. Unlike
a payment (a `transactions` row reducing remaining_balance by real money leaving an
account), an adjustment reduces or increases what's owed with no corresponding
account outflow/inflow. Creating an adjustment writes remaining_balance += amount
immediately (negative amount = reduces balance, e.g. insurance covered; positive =
increases it, e.g. late fee).

Reason:
A medical invoice's real owed amount moves for reasons other than a payment — insurer
adjustments and fees are common and need to be reflected in remaining_balance without
being misrepresented as money paid from an account (which would corrupt account
balances) or silently edited into starting_balance/remaining_balance by hand (which
loses the "why did this change" history). A separate ledger for non-payment balance
changes, parallel to transactions for payments, keeps both histories honest and
auditable — consistent with ADR-003's "transactions are the source of truth for money
movement" by NOT overloading transactions with non-movement events.

known_finance_charge (ADR-016) is unaffected — adjustments change remaining_balance
directly and don't interact with interest/finance-charge calculation.

Schema change:
```sql
create table debt_adjustments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  debt_id uuid not null references debts(id) on delete cascade,
  amount numeric(12,2) not null, -- signed: negative reduces remaining_balance
                                  -- (insurance covered, discount), positive increases
                                  -- it (late fee, NSF fee)
  adjustment_type text, -- free text: 'insurance_covered' | 'insurance_discount' |
                         -- 'late_fee' | 'nsf_fee' | 'other'
  description text,
  adjustment_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table debt_adjustments enable row level security;
create policy "household access" on debt_adjustments for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
```

Migration steps:
1. Run the SQL above.
2. Debt detail view gains an "Adjustments" section (list + add form), same visual
   pattern as the existing "Recent transactions" section.
3. Adding an adjustment updates debts.remaining_balance by the signed amount
   immediately, same immediacy as a cleared payment (ADR-035).
4. Deleting an adjustment reverses it: remaining_balance -= amount (mirrors the
   existing repair-delete pattern from ADR-037, not a full undo dialog).
5. debt_type gains "invoice" as a valid free-text value alongside Medical/Credit
   Card/Loan/Other/Advance — no constraint enforced (debt_type is already
   unconstrained free text per current schema).

Status: Decided 2026-08-10. Not yet implemented.

