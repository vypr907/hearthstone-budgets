## Discovered 2026-08-03
- [ ] Run the ADR-027 savings_goals SQL (table, linked_goal_id column, RLS policy) in Supabase.
- [x] Build the Savings Goals screen (ADR-027).
- [ ] Open question: whether savings goals should appear in pay_period_allocations (ADR-024 cross-reference).


## Discovered 2026-08-02
- [ ] Decide whether the combined spendable total should use available credit rather than raw balance for credit accounts.
- [x] Expose is_spendable and credit_limit in the account edit dialog.

## Discovered 2026-07-31
- [x] Create the shared check-off table so Payment Schedule months sync between both logins:
```sql
create table public.payment_schedule_checkoffs (
  household_id uuid not null references public.households(id) on delete cascade,
  month text not null,
  created_at timestamptz not null default now(),
  primary key (household_id, month)
);
grant select, insert, update, delete on public.payment_schedule_checkoffs to authenticated;
grant all on public.payment_schedule_checkoffs to service_role;
alter table public.payment_schedule_checkoffs enable row level security;
create policy "household members manage checkoffs"
on public.payment_schedule_checkoffs for all to authenticated
using (exists (select 1 from public.household_members m
  where m.household_id = payment_schedule_checkoffs.household_id and m.user_id = auth.uid()))
with check (exists (select 1 from public.household_members m
  where m.household_id = payment_schedule_checkoffs.household_id and m.user_id = auth.uid()));
```

- [ ] Run ADR-028 migration in Supabase: `alter table households add column export_format text not null default 'png' check (export_format in ('png','pdf'));`
- [x] ADR-028 Status Snapshot screen + PNG/PDF export + Settings toggle.
