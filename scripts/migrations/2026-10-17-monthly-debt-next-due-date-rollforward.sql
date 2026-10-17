-- ADR-086 addendum (2026-10-17): monthly/one-time debts never advance
-- next_due_date, unlike bills (which already do this unconditionally via
-- shift_billing_date). Brings the three debt-side RPCs to parity with their
-- already-correct bill equivalents. No data migration — function bodies only.

create or replace function public.apply_cleared_debt_payment(p_debt_id uuid, p_cleared_amount numeric, p_date date default current_date)
 returns table(remaining_owed numeric, next_due_date date, resolved_due_date date)
 language plpgsql
as $function$
declare
  v_result record;
begin
  if p_cleared_amount is null or p_cleared_amount <= 0 then
    raise exception 'apply_cleared_debt_payment: cleared amount must be positive';
  end if;

  with calc as (
    select
      d.id,
      coalesce(d.minimum_payment, 0) as target,
      coalesce(d.cycle_paid_to_date, 0) as previously_paid,
      coalesce(d.remaining_balance, 0) as remaining,
      d.next_due_date as old_next_due,
      -- ADR-056 addendum: advanceMinimumPaymentPatch uses an exact,
      -- case-sensitive, non-coalesced comparison; debtPayoffDatePatch uses
      -- a case-insensitive, coalesced one. Preserved verbatim, not
      -- reconciled — matches the pre-existing JS inconsistency.
      (d.debt_type = 'advance') as is_advance_strict,
      (lower(coalesce(d.debt_type, '')) = 'advance') as is_advance_ci,
      lower(coalesce(d.billing_cycle, 'monthly')) as cycle_key
    from public.debts d
    where d.id = p_debt_id
    for update
  ),
  calc2 as (
    select
      c.*,
      (c.previously_paid + p_cleared_amount) as paid,
      greatest(0, c.remaining - p_cleared_amount) as next_balance,
      (c.target > 0 and (c.previously_paid + p_cleared_amount) + 0.005 < c.target) as shortfall
    from calc c
  ),
  calc3 as (
    select
      c.*,
      (case when c.target > 0 then greatest(0, c.target - c.previously_paid) else p_cleared_amount end) as cycle_credit
    from calc2 c
  ),
  calc4 as (
    select
      c.*,
      greatest(0, p_cleared_amount - c.cycle_credit) as overflow
    from calc3 c
  )
  update public.debts d
  set
    remaining_balance = c.next_balance,
    minimum_payment = case when c.is_advance_strict then c.next_balance else d.minimum_payment end,
    date_paid_off = case
      when c.is_advance_ci then d.date_paid_off
      when c.next_balance <= 0.005 then coalesce(d.date_paid_off, p_date)
      when d.date_paid_off is not null then null
      else d.date_paid_off
    end,
    payment_status = case
      when c.shortfall then 'pending'
      when c.cycle_key = 'one_time' then (case when c.next_balance = 0 then 'cleared' else 'unpaid' end)
      when c.cycle_key = 'monthly' then 'cleared'
      else 'unpaid'
    end,
    cycle_paid_to_date = case when c.shortfall then c.paid else 0 end,
    -- ADR-086 addendum (2026-10-17): monthly/one-time now roll forward too,
    -- matching apply_cleared_bill_payment (shift_billing_date no-ops on
    -- 'onetime' internally, so this is safe for both cycle kinds).
    next_due_date = case
      when c.shortfall then d.next_due_date
      else public.shift_billing_date(coalesce(d.next_due_date, current_date), d.billing_cycle, d.cycle_interval_days, 1)
    end,
    arrears_paid_to_date = case
      when c.shortfall then d.arrears_paid_to_date
      when c.overflow > 0.005 then coalesce(d.arrears_paid_to_date, 0) + c.overflow
      else d.arrears_paid_to_date
    end
  from calc4 c
  where d.id = c.id
  returning
    (case when c.shortfall then c.target - c.paid else null end) as remaining_owed,
    d.next_due_date as next_due_date, -- NEW (post-update) value — the rolled-forward date
    -- ADR-086 addendum (2026-10-17): no longer suppressed for monthly/one-time
    -- — rollback_cleared_debt_payment already expects this unconditionally,
    -- same as rollback_cleared_bill_payment always has.
    (case when c.shortfall then null else c.old_next_due end) as resolved_due_date
  into v_result;

  if not found then
    raise exception 'apply_cleared_debt_payment: debt % not found or not visible', p_debt_id;
  end if;

  remaining_owed := v_result.remaining_owed;
  next_due_date := v_result.next_due_date;
  resolved_due_date := v_result.resolved_due_date;
  return next;
end;
$function$;

create or replace function public.apply_debt_cycle_reset(p_debt_id uuid, p_cleared_total numeric, p_resolved boolean)
 returns debts
 language plpgsql
as $function$
declare
  result public.debts;
begin
  if p_cleared_total is null or p_cleared_total < 0 then
    raise exception 'apply_debt_cycle_reset: cleared total must be non-negative';
  end if;

  update public.debts d
  set
    payment_status = 'unpaid',
    cycle_paid_to_date = 0,
    remaining_balance = coalesce(d.remaining_balance, 0) + p_cleared_total,
    date_paid_off = case
      when lower(coalesce(d.debt_type, '')) = 'advance' then d.date_paid_off
      when (coalesce(d.remaining_balance, 0) + p_cleared_total) <= 0.005
        then coalesce(d.date_paid_off, current_date)
      when d.date_paid_off is not null then null
      else d.date_paid_off
    end,
    -- ADR-086 addendum (2026-10-17): the 'monthly' exclusion removed, matching
    -- apply_bill_cycle_reset (which has never special-cased it).
    next_due_date = case
      when p_resolved
        and d.next_due_date is not null
      then public.shift_billing_date(d.next_due_date, d.billing_cycle, d.cycle_interval_days, -1)
      else d.next_due_date
    end
  where d.id = p_debt_id
  returning * into result;

  if not found then
    raise exception 'apply_debt_cycle_reset: debt % not found or not visible', p_debt_id;
  end if;
  return result;
end;
$function$;

create or replace function public.apply_debt_mark_unpaid(p_debt_id uuid, p_amount numeric, p_was_cleared boolean)
 returns debts
 language plpgsql
as $function$
declare
  result public.debts;
begin
  if p_was_cleared is null then
    raise exception 'apply_debt_mark_unpaid: p_was_cleared is required';
  end if;

  update public.debts d
  set
    payment_status = 'unpaid',
    remaining_balance = case
      when p_was_cleared then coalesce(d.remaining_balance, 0) + p_amount
      else d.remaining_balance
    end,
    cycle_paid_to_date = case
      when not p_was_cleared then d.cycle_paid_to_date
      when coalesce(d.cycle_paid_to_date, 0) > 0 then greatest(0, coalesce(d.cycle_paid_to_date, 0) - p_amount)
      else 0
    end,
    -- ADR-086 addendum (2026-10-17): the 'monthly' exclusion removed, matching
    -- apply_bill_mark_unpaid (which has never special-cased it).
    next_due_date = case
      when p_was_cleared
        and coalesce(d.cycle_paid_to_date, 0) <= 0
        and d.next_due_date is not null
      then public.shift_billing_date(d.next_due_date, d.billing_cycle, d.cycle_interval_days, -1)
      else d.next_due_date
    end
  where d.id = p_debt_id
  returning * into result;

  if not found then
    raise exception 'apply_debt_mark_unpaid: debt % not found or not visible', p_debt_id;
  end if;
  return result;
end;
$function$;
