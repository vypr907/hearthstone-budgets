## ADR-055: Income Source Deductions (Net/Gross Split)

Decision:
Add `income_source_deductions` (name, amount OR percent — exactly one — optional
`destination_account_id`, `is_pre_tax`). `income_sources`' existing amount field keeps
its current meaning (net); gross is computed as net + sum(deductions), never stored.
Marking a pay date received (ADR-047) posts the existing net splits AND one deposit
transaction per deduction that has a `destination_account_id` (cleared, same
`split_group_id` as the pay event, description "Deduction: <name>"). Deductions with no
destination account are reporting-only — no transaction.

Reason:
Matches the existing splits pattern (ADR-024/047) instead of inventing a second
mechanism. Reuses `split_group_id` so a deduction deposit groups with the rest of that
pay event in the ledger UI.

Schema:
```sql
create table income_source_deductions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  income_source_id uuid not null references income_sources(id) on delete cascade,
  name text not null,
  amount numeric(12,2),
  percent numeric(6,3),
  destination_account_id uuid references accounts(id),
  is_pre_tax boolean not null default false,
  created_at timestamptz not null default now(),
  check ((amount is not null and percent is null) or (amount is null and percent is not null))
);

alter table income_source_deductions enable row level security;
create policy "household access" on income_source_deductions for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

grant select, insert, update, delete on income_source_deductions to authenticated;
grant all on income_source_deductions to service_role;
```

**Resolved 2026-08-11:** percent-type deductions compute against the income event's
`actual_amount` (net), not a derived gross figure. So: gross = net + Σ(flat amounts) +
Σ(percent × net). No gross figure is stored anywhere — it's computed for display only.

Status: Decided 2026-08-11. SQL run and verified. Ready to implement.

---

