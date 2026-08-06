## Discovered 2026-08-06
- [x] ADR-040 generalized custom billing cycle (cycle_interval_days on bills/debts).
- [x] ADR-041 manual override for spending actuals (is_manual_override).

## Discovered 2026-08-05
- [x] ADR-035 universal partial payments (bills, debts, linked manual transactions).
- [x] Verify `debts.cycle_paid_to_date` exists in Supabase before relying on debt partials.
- [x] ADR-036 ledger-derived 4-state payment cycle + full-cycle reset.
- [x] ADR-037 payable-first payment writes and repair delete.
- [x] ADR-038 envelope Set Aside transfers.
- [x] ADR-039 savings goals in pay_period_allocations.
- [x] ADR-037 repair scan for stranded pre-fix debt payments.
- [ ] Redo the cleaned-up debt payments through Submit / Mark cleared and confirm status,
      remaining balance, paid-this-cycle and next due date all advance.

## Discovered 2026-08-03
- [x] Run the ADR-027 savings_goals SQL (table, linked_goal_id column, RLS policy) in Supabase.
- [x] Build the Savings Goals screen (ADR-027).
- [x] Open question: whether savings goals should appear in pay_period_allocations (ADR-024/039 cross-reference).


## Discovered 2026-08-02
- [x] Decide whether the combined spendable total should use available credit rather than raw balance for credit accounts.
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

- [x] ADR-029 category icon/colour metadata
- [x] ADR-030 institution logo_url + type icons, grouping, linked bills/debts
- [x] ADR-031 institution-level balance & due aggregation
- [x] ADR-032 paycheck-deduction debts (form toggle, badges, paycheck exclusion)
- [x] Debts: auto date_paid_off, "Show paid off" toggle, title-cased cycles, recent transactions
- [x] ADR-033 monthlyEquivalent(), envelope auto-creation, goal account_id
- [x] Account labels + pay-time picker polish (icon, logo, last 4)
- [x] ADR-033 bill card "Add to envelope" quick-transaction action — done 2026-08-06.
- [x] ADR-034 Dashboard hero rework, budget/actual bills split, owed-this-period card, Net Worth to bottom — done 2026-08-06
- [ ] Snapshot: balances by account type, pay-period progress bar, buildSnapshotSummary()
- [x] ADR-036 ledger-derived 4-state payment cycle + full-cycle reset
- [x] ADR-037 payable-first payment writes, verified updates, linked-transaction repair delete
- [x] Spending: month navigator (prev/next) — done 2026-08-06.
