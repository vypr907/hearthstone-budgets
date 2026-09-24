-- 2026-09-24 — Atomic RPCs for the remaining 5 payment/debt functions
-- (ADR-101 addendum, Issue #67). SCHEMA CHANGE: adds 11 Postgres functions
-- (10 payment-state RPCs + 1 new shared pure helper). No table/column
-- change, no RLS change — every RPC below runs `security invoker`, bound by
-- the caller's own RLS policies on `bills`/`debts` exactly like a normal
-- client `.update()` would be.
--
-- Converts the last 5 functions in src/lib/payments.ts still doing the
-- "read a Payable's embedded bill/debt snapshot, branch in JS, write the
-- computed result back via updateRow" pattern that caused the two real
-- balance-corruption incidents behind ADR-101/#66:
--   useMarkUnpaid          -> apply_debt_mark_unpaid / apply_bill_mark_unpaid
--   useResetCycle          -> apply_debt_cycle_reset / apply_bill_cycle_reset
--   useReversePayment      -> apply_debt_payment_reversal / apply_bill_payment_reversal
--   rollbackClearedPayment -> rollback_cleared_debt_payment / rollback_cleared_bill_payment
--   useCorrectPayment      -> correct_cleared_debt_payment / correct_cleared_bill_payment
--
-- The issue's column list mixed debt-only and bill-only columns, so both
-- entity branches of all 5 functions are converted here (10 RPCs), not
-- just the debt side. One dedicated RPC per JS function per entity type —
-- matching how apply_debt_advance/apply_debt_adjustment/
-- apply_cleared_debt_payment/apply_cleared_bill_payment were each kept
-- separate even where shapes were similar, rather than consolidating.
--
-- Each RPC is a direct single-UPDATE port of its JS function's existing
-- branch, referencing only old-row column values via the table alias
-- (every reference in one UPDATE's SET list sees the same pre-update
-- snapshot, so duplicating a condition/expression across SET clauses is
-- safe, not a staleness risk — same style already used by
-- apply_debt_advance/apply_debt_adjustment). `IF NOT FOUND THEN RAISE
-- EXCEPTION` is the atomic replacement for updateRow's client-side 0-row
-- guard.
--
-- New shared helper `rebuild_bill_cycle_amount_due` ports
-- rebuiltCycleAmountDue (payments.ts) into SQL — needed by both
-- apply_bill_mark_unpaid and apply_bill_cycle_reset — reusing the existing
-- `shift_billing_date` (2026-09-13 migration) for its window math instead
-- of duplicating date logic a third time.
--
-- Reversal/rollback/reset date math reuses `shift_billing_date(..., -1)`,
-- which already computes exactly what the client's `reverseDate()` does.
--
-- What does NOT change: everything outside the "read Payable -> write
-- balance columns" step in these 5 functions — ledger transaction
-- inserts/deletes, paired-fee cleanup, account-mirror reversal, and
-- ADR-037's payable-first-then-ledger ordering all stay exactly as they
-- are in src/lib/payments.ts; only the debt/bill row write itself moves
-- into these RPCs. useCorrectPayment's client-side resolve-boundary
-- validation also stays in JS as a fast pre-check (unchanged messages) —
-- the two correct_cleared_*_payment RPCs re-enforce the same three guards
-- server-side as the authoritative check, closing the race window between
-- the pre-check and the write, same pattern as apply_cleared_bill_payment's
-- overpay cap.

begin;

-- Shared helper: port of rebuiltCycleAmountDue (payments.ts). Rebuilds a
-- bill's cycle_amount_due from any bill_adjustments active in the billing
-- window around p_due_date. Returns null when the bill is variable-amount,
-- p_due_date is null, or no adjustment is active in that window — matching
-- rebuiltCycleAmountDue's own null cases exactly (a null here means "don't
-- touch cycle_amount_due", not "clear it to zero").
create or replace function public.rebuild_bill_cycle_amount_due(
  p_bill_id uuid,
  p_due_date date
)
returns numeric
language plpgsql
security invoker
as $$
declare
  v_amount numeric;
  v_cycle text;
  v_interval int;
  v_variable boolean;
  v_start date;
  v_end date;
  v_count int;
  v_delta numeric;
begin
  select amount, billing_cycle, cycle_interval_days, coalesce(is_variable_amount, false)
    into v_amount, v_cycle, v_interval, v_variable
  from public.bills where id = p_bill_id;

  if not found or p_due_date is null or v_variable then
    return null;
  end if;

  v_start := public.shift_billing_date(p_due_date, v_cycle, v_interval, -1);
  v_end := public.shift_billing_date(p_due_date, v_cycle, v_interval, 1);

  select count(*), coalesce(sum(amount), 0)
    into v_count, v_delta
  from public.bill_adjustments
  where bill_id = p_bill_id
    and affects_balance is distinct from false
    and adjustment_date > v_start
    and adjustment_date <= v_end;

  if v_count = 0 then
    return null;
  end if;

  return greatest(0, round((coalesce(v_amount, 0) + v_delta) * 100) / 100);
end;
$$;

-- ---------------------------------------------------------------------
-- useMarkUnpaid (payments.ts:906-988) — full reversal of one payment.
-- payment_status always resets to 'unpaid' (matches JS's unconditional
-- `update = { payment_status: "unpaid" }` before the wasCleared branch).
-- ---------------------------------------------------------------------

create or replace function public.apply_debt_mark_unpaid(
  p_debt_id uuid,
  p_amount numeric,
  p_was_cleared boolean
)
returns public.debts
language plpgsql
security invoker
as $$
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
    next_due_date = case
      when p_was_cleared
        and coalesce(d.cycle_paid_to_date, 0) <= 0
        and lower(coalesce(d.billing_cycle, 'monthly')) <> 'monthly'
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
$$;

create or replace function public.apply_bill_mark_unpaid(
  p_bill_id uuid,
  p_amount numeric,
  p_was_cleared boolean
)
returns public.bills
language plpgsql
security invoker
as $$
declare
  result public.bills;
begin
  if p_was_cleared is null then
    raise exception 'apply_bill_mark_unpaid: p_was_cleared is required';
  end if;

  update public.bills b
  set
    payment_status = 'unpaid',
    cycle_paid_to_date = case
      when not p_was_cleared then b.cycle_paid_to_date
      when coalesce(b.cycle_paid_to_date, 0) > 0 then greatest(0, coalesce(b.cycle_paid_to_date, 0) - p_amount)
      else 0
    end,
    next_due_date = case
      when p_was_cleared
        and coalesce(b.cycle_paid_to_date, 0) <= 0
        and b.next_due_date is not null
      then public.shift_billing_date(b.next_due_date, b.billing_cycle, b.cycle_interval_days, -1)
      else b.next_due_date
    end,
    cycle_amount_due = case
      when not p_was_cleared then b.cycle_amount_due
      when coalesce(b.cycle_paid_to_date, 0) > 0 then
        case
          when greatest(0, coalesce(b.cycle_paid_to_date, 0) - p_amount) = 0
               and not coalesce(b.is_variable_amount, false)
          then public.rebuild_bill_cycle_amount_due(b.id, b.next_due_date)
          else b.cycle_amount_due
        end
      when b.next_due_date is not null then
        public.rebuild_bill_cycle_amount_due(
          b.id,
          public.shift_billing_date(b.next_due_date, b.billing_cycle, b.cycle_interval_days, -1)
        )
      else b.cycle_amount_due
    end
  where b.id = p_bill_id
  returning * into result;

  if not found then
    raise exception 'apply_bill_mark_unpaid: bill % not found or not visible', p_bill_id;
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- useResetCycle (payments.ts:1005-1079) — full cycle undo. Note: unlike
-- the other 4 conversions, the debt branch here does NOT mirror
-- minimum_payment for advance debts — preserved verbatim, matching the
-- existing (pre-existing, not introduced here) JS behavior exactly.
-- ---------------------------------------------------------------------

create or replace function public.apply_debt_cycle_reset(
  p_debt_id uuid,
  p_cleared_total numeric,
  p_resolved boolean
)
returns public.debts
language plpgsql
security invoker
as $$
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
    next_due_date = case
      when p_resolved
        and lower(coalesce(d.billing_cycle, 'monthly')) <> 'monthly'
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
$$;

create or replace function public.apply_bill_cycle_reset(
  p_bill_id uuid,
  p_resolved boolean
)
returns public.bills
language plpgsql
security invoker
as $$
declare
  result public.bills;
begin
  update public.bills b
  set
    payment_status = 'unpaid',
    cycle_paid_to_date = 0,
    next_due_date = case
      when p_resolved and b.next_due_date is not null
      then public.shift_billing_date(b.next_due_date, b.billing_cycle, b.cycle_interval_days, -1)
      else b.next_due_date
    end,
    cycle_amount_due = public.rebuild_bill_cycle_amount_due(
      b.id,
      case
        when p_resolved and b.next_due_date is not null
        then public.shift_billing_date(b.next_due_date, b.billing_cycle, b.cycle_interval_days, -1)
        else b.next_due_date
      end
    )
  where b.id = p_bill_id
  returning * into result;

  if not found then
    raise exception 'apply_bill_cycle_reset: bill % not found or not visible', p_bill_id;
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- useReversePayment (payments.ts:1089-1163) — reverses one specific
-- cleared transaction. payment_status only moves to 'unpaid' when the
-- reversed cycle total no longer meets the cycle due — otherwise left
-- untouched (unlike Mark Unpaid, this one does NOT unconditionally reset
-- it).
-- ---------------------------------------------------------------------

create or replace function public.apply_debt_payment_reversal(
  p_debt_id uuid,
  p_amount numeric
)
returns public.debts
language plpgsql
security invoker
as $$
declare
  result public.debts;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'apply_debt_payment_reversal: amount must be positive';
  end if;

  update public.debts d
  set
    remaining_balance = coalesce(d.remaining_balance, 0) + p_amount,
    cycle_paid_to_date = greatest(0, coalesce(d.cycle_paid_to_date, 0) - p_amount),
    minimum_payment = case
      when d.debt_type = 'advance' then coalesce(d.remaining_balance, 0) + p_amount
      else d.minimum_payment
    end,
    date_paid_off = case
      when lower(coalesce(d.debt_type, '')) = 'advance' then d.date_paid_off
      when (coalesce(d.remaining_balance, 0) + p_amount) <= 0.005
        then coalesce(d.date_paid_off, current_date)
      when d.date_paid_off is not null then null
      else d.date_paid_off
    end,
    payment_status = case
      when (greatest(0, coalesce(d.cycle_paid_to_date, 0) - p_amount) + 0.005) < coalesce(d.minimum_payment, 0)
      then 'unpaid'
      else d.payment_status
    end
  where d.id = p_debt_id
  returning * into result;

  if not found then
    raise exception 'apply_debt_payment_reversal: debt % not found or not visible', p_debt_id;
  end if;
  return result;
end;
$$;

create or replace function public.apply_bill_payment_reversal(
  p_bill_id uuid,
  p_amount numeric
)
returns public.bills
language plpgsql
security invoker
as $$
declare
  result public.bills;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'apply_bill_payment_reversal: amount must be positive';
  end if;

  update public.bills b
  set
    cycle_paid_to_date = greatest(0, coalesce(b.cycle_paid_to_date, 0) - p_amount),
    payment_status = case
      when (greatest(0, coalesce(b.cycle_paid_to_date, 0) - p_amount) + 0.005)
           < coalesce(b.cycle_amount_due, b.amount, 0)
      then 'unpaid'
      else b.payment_status
    end
  where b.id = p_bill_id
  returning * into result;

  if not found then
    raise exception 'apply_bill_payment_reversal: bill % not found or not visible', p_bill_id;
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- rollbackClearedPayment (payments.ts:1287-1326) — undo the payable-side
-- effect of one cleared payment WITHOUT an offsetting ledger row (used by
-- useEditLinkedTransaction's rollback-then-reapply). p_resolved_due_date
-- restores an exact prior due date instead of guessing backwards.
-- ---------------------------------------------------------------------

create or replace function public.rollback_cleared_debt_payment(
  p_debt_id uuid,
  p_amount numeric,
  p_resolved_due_date date default null
)
returns public.debts
language plpgsql
security invoker
as $$
declare
  result public.debts;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'rollback_cleared_debt_payment: amount must be non-negative';
  end if;

  update public.debts d
  set
    remaining_balance = coalesce(d.remaining_balance, 0) + p_amount,
    cycle_paid_to_date = case
      when p_resolved_due_date is not null then 0
      else greatest(0, coalesce(d.cycle_paid_to_date, 0) - p_amount)
    end,
    next_due_date = coalesce(p_resolved_due_date, d.next_due_date),
    minimum_payment = case
      when d.debt_type = 'advance' then coalesce(d.remaining_balance, 0) + p_amount
      else d.minimum_payment
    end,
    date_paid_off = case
      when lower(coalesce(d.debt_type, '')) = 'advance' then d.date_paid_off
      when (coalesce(d.remaining_balance, 0) + p_amount) <= 0.005
        then coalesce(d.date_paid_off, current_date)
      when d.date_paid_off is not null then null
      else d.date_paid_off
    end,
    payment_status = case
      when p_resolved_due_date is not null then 'unpaid'
      when (greatest(0, coalesce(d.cycle_paid_to_date, 0) - p_amount) + 0.005) < coalesce(d.minimum_payment, 0)
      then (case when greatest(0, coalesce(d.cycle_paid_to_date, 0) - p_amount) > 0.005 then 'pending' else 'unpaid' end)
      else d.payment_status
    end
  where d.id = p_debt_id
  returning * into result;

  if not found then
    raise exception 'rollback_cleared_debt_payment: debt % not found or not visible', p_debt_id;
  end if;
  return result;
end;
$$;

create or replace function public.rollback_cleared_bill_payment(
  p_bill_id uuid,
  p_amount numeric,
  p_resolved_due_date date default null
)
returns public.bills
language plpgsql
security invoker
as $$
declare
  result public.bills;
begin
  if p_amount is null or p_amount < 0 then
    raise exception 'rollback_cleared_bill_payment: amount must be non-negative';
  end if;

  update public.bills b
  set
    cycle_paid_to_date = case
      when p_resolved_due_date is not null then 0
      else greatest(0, coalesce(b.cycle_paid_to_date, 0) - p_amount)
    end,
    next_due_date = coalesce(p_resolved_due_date, b.next_due_date),
    payment_status = case
      when p_resolved_due_date is not null then 'unpaid'
      when (greatest(0, coalesce(b.cycle_paid_to_date, 0) - p_amount) + 0.005)
           < coalesce(b.cycle_amount_due, b.amount, 0)
      then (case when greatest(0, coalesce(b.cycle_paid_to_date, 0) - p_amount) > 0.005 then 'pending' else 'unpaid' end)
      else b.payment_status
    end
  where b.id = p_bill_id
  returning * into result;

  if not found then
    raise exception 'rollback_cleared_bill_payment: bill % not found or not visible', p_bill_id;
  end if;
  return result;
end;
$$;

-- ---------------------------------------------------------------------
-- useCorrectPayment (payments.ts:1181-1265) — corrects an already-cleared
-- PARTIAL payment in place. The resolve-boundary/partial-total validation
-- stays in JS as a fast, friendly pre-check (unchanged messages); these
-- RPCs re-enforce the same three guards as the authoritative,
-- race-closing check. The third guard's message carries a dynamic due
-- amount, so it uses the same sentinel + client-regex pattern as
-- apply_cleared_bill_payment's overpay cap; the first two don't need a
-- dynamic value, so they raise the exact existing JS message text
-- directly.
-- ---------------------------------------------------------------------

create or replace function public.correct_cleared_debt_payment(
  p_debt_id uuid,
  p_original_amount numeric,
  p_new_amount numeric,
  p_date date default current_date
)
returns public.debts
language plpgsql
security invoker
as $$
declare
  result public.debts;
  v_due numeric;
  v_paid_before numeric;
  v_paid_after numeric;
begin
  if p_new_amount is null or p_new_amount <= 0.005 then
    raise exception 'correct_cleared_debt_payment: amount must be positive';
  end if;

  select coalesce(minimum_payment, 0), coalesce(cycle_paid_to_date, 0)
    into v_due, v_paid_before
  from public.debts where id = p_debt_id for update;

  if not found then
    raise exception 'correct_cleared_debt_payment: debt % not found or not visible', p_debt_id;
  end if;

  if p_original_amount > v_paid_before + 0.005 then
    raise exception 'This transaction doesn''t match the debt''s current partial total — use Reverse instead.';
  end if;
  if v_paid_before + 0.005 >= v_due then
    raise exception 'This cycle is already fully paid — correcting a payment that resolved it isn''t supported here. Reverse it, then redo the payment.';
  end if;
  v_paid_after := v_paid_before - p_original_amount + p_new_amount;
  if v_paid_after + 0.005 >= v_due then
    raise exception using
      errcode = 'P0001',
      message = format('CORRECT_PAYMENT_WOULD_RESOLVE %s', v_due);
  end if;

  update public.debts d
  set
    cycle_paid_to_date = v_paid_after,
    remaining_balance = greatest(0, coalesce(d.remaining_balance, 0) + (p_original_amount - p_new_amount)),
    minimum_payment = case
      when d.debt_type = 'advance'
      then greatest(0, coalesce(d.remaining_balance, 0) + (p_original_amount - p_new_amount))
      else d.minimum_payment
    end,
    date_paid_off = case
      when lower(coalesce(d.debt_type, '')) = 'advance' then d.date_paid_off
      when greatest(0, coalesce(d.remaining_balance, 0) + (p_original_amount - p_new_amount)) <= 0.005
        then coalesce(d.date_paid_off, p_date)
      when d.date_paid_off is not null then null
      else d.date_paid_off
    end
  where d.id = p_debt_id
  returning * into result;

  return result;
end;
$$;

create or replace function public.correct_cleared_bill_payment(
  p_bill_id uuid,
  p_original_amount numeric,
  p_new_amount numeric
)
returns public.bills
language plpgsql
security invoker
as $$
declare
  result public.bills;
  v_due numeric;
  v_paid_before numeric;
  v_paid_after numeric;
begin
  if p_new_amount is null or p_new_amount <= 0.005 then
    raise exception 'correct_cleared_bill_payment: amount must be positive';
  end if;

  select coalesce(cycle_amount_due, amount, 0), coalesce(cycle_paid_to_date, 0)
    into v_due, v_paid_before
  from public.bills where id = p_bill_id for update;

  if not found then
    raise exception 'correct_cleared_bill_payment: bill % not found or not visible', p_bill_id;
  end if;

  if p_original_amount > v_paid_before + 0.005 then
    raise exception 'This transaction doesn''t match the bill''s current partial total — use Reverse instead.';
  end if;
  if v_paid_before + 0.005 >= v_due then
    raise exception 'This cycle is already fully paid — correcting a payment that resolved it isn''t supported here. Reverse it, then redo the payment.';
  end if;
  v_paid_after := v_paid_before - p_original_amount + p_new_amount;
  if v_paid_after + 0.005 >= v_due then
    raise exception using
      errcode = 'P0001',
      message = format('CORRECT_PAYMENT_WOULD_RESOLVE %s', v_due);
  end if;

  update public.bills set cycle_paid_to_date = v_paid_after where id = p_bill_id
  returning * into result;

  return result;
end;
$$;

commit;
