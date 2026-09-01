-- ADR-066 addendum: enforce the non-Advance debt payoff-date invariant.
-- Run manually in the Supabase SQL Editor.

create or replace function public.sync_debt_date_paid_off()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if lower(coalesce(new.debt_type, '')) <> 'advance' then
    if coalesce(new.remaining_balance, 0) <= 0.005 then
      new.date_paid_off := coalesce(new.date_paid_off, current_date);
    elsif new.date_paid_off is not null then
      new.date_paid_off := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_debt_date_paid_off on public.debts;
create trigger trg_sync_debt_date_paid_off
before insert or update of remaining_balance, debt_type, date_paid_off
on public.debts
for each row
execute function public.sync_debt_date_paid_off();

with payoff_dates as (
  select
    d.id,
    coalesce(max(t.transaction_date) filter (where t.status = 'cleared'), current_date) as paid_on
  from public.debts d
  left join public.transactions t on t.linked_debt_id = d.id
  where lower(coalesce(d.debt_type, '')) <> 'advance'
    and coalesce(d.remaining_balance, 0) <= 0.005
    and d.date_paid_off is null
  group by d.id
)
update public.debts d
set date_paid_off = p.paid_on
from payoff_dates p
where d.id = p.id;