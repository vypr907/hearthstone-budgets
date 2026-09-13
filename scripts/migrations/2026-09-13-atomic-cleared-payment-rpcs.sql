-- 2026-09-13 — Atomic cleared-payment RPCs (ADR-101 addendum, Issue #66).
-- SCHEMA CHANGE: adds three Postgres functions (one pure date-math helper,
-- two payment-state RPCs). No table/column change, no RLS change — both
-- payment RPCs run `security invoker`, bound by the caller's own RLS
-- policies on `bills`/`debts` exactly like a normal client `.update()`
-- would be.
--
-- Folds applyClearedPayment's in-cycle branch (src/lib/payments.ts) — the
-- one ADR-101 explicitly left unconverted — into one atomic UPDATE per
-- kind, so two cleared payments submitted close together on the same
-- bill/debt serialize instead of one clobbering the other's
-- cycle_paid_to_date/remaining_balance, rolling the cycle twice, or
-- advancing next_due_date from a stale snapshot.
--
-- NOT covered (deliberate scope limit — see issue #66): the priorArrears
-- walk (priorCyclesArrears/arrears.ts) stays a pure client-side
-- computation passed in as p_prior_arrears — read-only derivation from row
-- state, not part of the write, and porting its multi-cycle loop to SQL is
-- a materially bigger, separate change. Also not covered: 5 sibling
-- functions in payments.ts (useMarkUnpaid, useResetCycle,
-- useReversePayment, rollbackClearedPayment, useCorrectPayment) do the
-- same "read Payable, branch, write" pattern against the same columns —
-- tracked as a follow-up issue, not converted here.

begin;

-- Pure date-math port of shiftDate()/advanceDate() (src/lib/format.ts),
-- direction-generalized (this pass only ever calls it with direction=1).
-- Deliberately takes no "today" fallback baked in: callers pass
-- coalesce(next_due_date, current_date) explicitly, resolved live inside
-- the same atomic statement — mirrors the JS call sites' own
-- `debt.next_due_date ?? todayISO()` (real today, never the payment's own
-- possibly-backdated date).
create or replace function public.shift_billing_date(
  p_date date,
  p_cycle text,
  p_interval_days integer,
  p_direction integer default 1
)
returns date
language plpgsql
security invoker
immutable
as $$
declare
  key text := lower(regexp_replace(coalesce(p_cycle, ''), '[\s_-]', '', 'g'));
  months int;
  target_day int := extract(day from p_date)::int;
  first_of_target date;
  last_day int;
begin
  if key = 'onetime' then
    return p_date;
  elsif key = 'custom' then
    if p_interval_days is null or p_interval_days <= 0 then
      raise exception 'shift_billing_date: custom cycle has no interval set';
    end if;
    return p_date + (p_interval_days * p_direction);
  elsif key = 'biweekly' then
    return p_date + (14 * p_direction);
  elsif key = 'bimonthly' then
    months := 2 * p_direction;
  elsif key = 'quarterly' then
    months := 3 * p_direction;
  elsif key in ('annually', 'annual', 'yearly') then
    months := 12 * p_direction;
  else
    -- 'monthly' and anything unrecognized — matches shiftDate's default case.
    months := 1 * p_direction;
  end if;

  first_of_target := (date_trunc('month', p_date) + make_interval(months => months))::date;
  last_day := extract(day from (first_of_target + interval '1 month - 1 day'))::int;
  return first_of_target + (least(target_day, last_day) - 1);
end;
$$;

-- Mirrors applyClearedPayment's debt branch (payments.ts:290-351). Every
-- value read from the row is captured once, inside the single `for
-- update`-locked CTE, and threaded forward via that CTE's own columns —
-- never re-joined from a second plain scan of the same table later in the
-- statement, which would not be guaranteed to see the same post-lock-wait
-- row version (Postgres's EvalPlanQual applies to the locking scan itself,
-- not to unrelated scans of the same table in the same query).
create or replace function public.apply_cleared_debt_payment(
  p_debt_id uuid,
  p_cleared_amount numeric,
  p_date date default current_date
)
returns table (
  remaining_owed numeric,
  next_due_date date,
  resolved_due_date date
)
language plpgsql
security invoker
as $$
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
    next_due_date = case
      when c.shortfall then d.next_due_date
      when c.cycle_key in ('one_time', 'monthly') then d.next_due_date
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
    (case
       when (not c.shortfall) and c.cycle_key not in ('one_time', 'monthly') then c.old_next_due -- OLD snapshot — the date just resolved past
       else null
     end) as resolved_due_date
  into v_result;

  if not found then
    raise exception 'apply_cleared_debt_payment: debt % not found or not visible', p_debt_id;
  end if;

  remaining_owed := v_result.remaining_owed;
  next_due_date := v_result.next_due_date;
  resolved_due_date := v_result.resolved_due_date;
  return next;
end;
$$;

-- Mirrors applyClearedPayment's bill branch (payments.ts:353-404). The
-- exceeds-max-allowed rejection (ADR-057/076) is enforced here too, not
-- just in the client pre-check: the UPDATE runs, then if the (locked,
-- live) row shows the cap was exceeded, RAISE EXCEPTION aborts the
-- transaction and rolls the UPDATE back — so two concurrent payments that
-- each individually pass the client's (necessarily stale) pre-check can't
-- jointly overpay past what the row actually owes once serialized.
create or replace function public.apply_cleared_bill_payment(
  p_bill_id uuid,
  p_cleared_amount numeric,
  p_prior_arrears numeric,
  p_date date default current_date
)
returns table (
  remaining_owed numeric,
  next_due_date date,
  resolved_due_date date
)
language plpgsql
security invoker
as $$
declare
  v_result record;
begin
  if p_cleared_amount is null or p_cleared_amount <= 0 then
    raise exception 'apply_cleared_bill_payment: cleared amount must be positive';
  end if;
  if p_prior_arrears is null then
    raise exception 'apply_cleared_bill_payment: prior arrears is required (pass 0, not null)';
  end if;

  with calc as (
    select
      b.id,
      coalesce(b.cycle_amount_due, b.amount, 0) as due_this_cycle,
      coalesce(b.cycle_paid_to_date, 0) as previously_paid,
      b.next_due_date as old_next_due
    from public.bills b
    where b.id = p_bill_id
    for update
  ),
  calc2 as (
    select
      c.*,
      greatest(0, c.due_this_cycle - c.previously_paid) as remaining_this_cycle,
      (c.previously_paid + p_cleared_amount) as paid
    from calc c
  ),
  calc3 as (
    select
      c.*,
      (c.remaining_this_cycle + p_prior_arrears) as max_allowed,
      (c.paid + 0.005 < c.due_this_cycle) as shortfall,
      greatest(0, p_cleared_amount - c.remaining_this_cycle) as overflow
    from calc2 c
  ),
  calc4 as (
    select
      c.*,
      (c.max_allowed > 0.005 and p_cleared_amount > c.max_allowed + 0.005) as exceeds_cap
    from calc3 c
  )
  update public.bills b
  set
    payment_status = case when c.shortfall then 'pending' else 'unpaid' end,
    cycle_paid_to_date = case when c.shortfall then c.paid else 0 end,
    cycle_amount_due = case when c.shortfall then c.due_this_cycle else null end,
    next_due_date = case
      when c.shortfall then b.next_due_date
      else public.shift_billing_date(coalesce(b.next_due_date, current_date), b.billing_cycle, b.cycle_interval_days, 1)
    end,
    arrears_paid_to_date = case
      when c.shortfall then b.arrears_paid_to_date
      when c.overflow > 0.005 then coalesce(b.arrears_paid_to_date, 0) + c.overflow
      else b.arrears_paid_to_date
    end
  from calc4 c
  where b.id = c.id
  returning
    c.exceeds_cap,
    c.max_allowed,
    (case when c.shortfall then c.due_this_cycle - c.paid else null end) as remaining_owed,
    b.next_due_date as next_due_date,
    (case when c.shortfall then null else c.old_next_due end) as resolved_due_date
  into v_result;

  if not found then
    raise exception 'apply_cleared_bill_payment: bill % not found or not visible', p_bill_id;
  end if;

  if v_result.exceeds_cap then
    -- Sentinel message, parsed back into the exact user-facing string by
    -- the JS wrapper (via formatMoney) — replicating Intl.NumberFormat's
    -- "$1,234.56" output in PL/pgSQL is fragile; SQL's job is just to carry
    -- the live max_allowed number out atomically.
    raise exception using
      errcode = 'P0001',
      message = format('CLEARED_PAYMENT_EXCEEDS_MAX %s', v_result.max_allowed);
  end if;

  remaining_owed := v_result.remaining_owed;
  next_due_date := v_result.next_due_date;
  resolved_due_date := v_result.resolved_due_date;
  return next;
end;
$$;

commit;
