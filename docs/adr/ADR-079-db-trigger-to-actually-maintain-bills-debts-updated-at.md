## ADR-079: DB Trigger to Actually Maintain `bills`/`debts.updated_at`

Decision:
Add a Postgres trigger function and `BEFORE UPDATE` triggers on `bills` and `debts` that
set `updated_at = now()` on every row update, at the database level.

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_bills_updated_at on public.bills;
create trigger set_bills_updated_at
before update on public.bills
for each row execute function public.set_updated_at();

drop trigger if exists set_debts_updated_at on public.debts;
create trigger set_debts_updated_at
before update on public.debts
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
```

Reason:
Found 2026-08-22 while diagnosing why "Credit now" rejected a correct payment on the
Beiers bill: `bills`/`debts.updated_at` has a `default_value: now()` (applies on INSERT
only) but no DB trigger, and no application code path (`payments.ts`, `data-hooks.ts`'s
`useUpsertBill`) ever sets it explicitly on UPDATE — so it's frozen at insert time
forever, regardless of how many times a row is actually written. This silently
undermines two "was this touched recently" checks built this session:
`findStrandedBillPayments`/`findStrandedDebtPayments`'s dedup guard (skip flagging a row
if `updated_at` has moved past the stray ledger rows — never true, since it never moves)
and `computeArrears`'s `clearedRecently` check for monthly debts (trusts
`payment_status='cleared'` only when `updated_at` is recent enough — also never true).
Neither check is unsafe as a result (both just fail closed, falling back to their
pre-existing behavior), but neither works as designed either. A single DB-level trigger
fixes this for every current and future write path at once, instead of hunting down and
patching every `.update()` call site in the frontend individually.

Scoped to `bills`/`debts` only — the two tables the affected checks actually read.
Other tables with an `updated_at` column (`accounts`, `transactions`, `savings_goals`,
`institutions`) can get the same trigger later if something ends up depending on theirs
too; not needed now.

Status: Decided 2026-08-22. Not implemented.
