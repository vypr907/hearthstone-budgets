## ADR-027: Savings Goals (Sinking Funds)

Decision:
Add a new `savings_goals` table (household_id, name, target_amount, target_date,
current_amount, icon/emoji, created_at, updated_at) with standard household RLS.
Add/withdraw actions create a `transactions` row with a new `linked_goal_id uuid
references savings_goals(id)` column, mirroring the existing linked_bill_id/
linked_debt_id pattern. A goal's current_amount is derived the same way account
balances are: sum of cleared transactions linked to that goal (not a separately
maintained running total), for consistency with ADR-003 (transactions as source
of truth).

Reason:
Reference apps show a common, clearly useful pattern (Emergency Fund, Vacation,
Christmas) — a target amount/date with a "monthly amount needed" calculation and
Add/Withdraw actions. Nothing in the current schema supports this; it's a new
first-class concept alongside bills/debts, not a variant of either.

Schema change:
```sql
create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  icon text,
  target_amount numeric(12,2) not null,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transactions add column linked_goal_id uuid references savings_goals(id);

alter table savings_goals enable row level security;
create policy "household access" on savings_goals for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
```

Migration steps:
1. Run the SQL above.
2. current_amount is NOT a stored column — compute as
   `sum(transactions.amount) where linked_goal_id = goal.id and status = 'cleared'`,
   same pattern as account balances.
3. "Monthly amount needed" = `(target_amount - current_amount) / months_remaining
   (from target_date)` — computed client-side, not stored.
4. Add/Withdraw UI reuses the existing quick-transaction entry pattern (Phase 4.5)
   with linked_goal_id set instead of linked_bill_id/linked_debt_id.

Status: Decided 2026-08-03. Implemented (UI + derived current_amount). SQL must be
run manually in the self-managed Supabase project; no goal <-> pay_period_allocations
link was built (see ADR-024 cross-reference note).

