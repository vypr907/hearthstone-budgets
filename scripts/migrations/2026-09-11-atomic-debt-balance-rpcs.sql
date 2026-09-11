-- 2026-09-11 — Atomic debt-balance RPCs (ADR-101). SCHEMA CHANGE: adds two
-- Postgres functions. No table/column change, no RLS change (both run
-- `security invoker`, so they're bound by the caller's own RLS policies on
-- `debts` exactly like a normal client `.update()` would be).
--
-- Replaces the "read remaining_balance from whatever the browser currently
-- holds, compute next value in JS, write the absolute result back" pattern
-- in useCreateAdvance and useAddDebtAdjustment (src/lib/data-hooks.ts) —
-- the pattern responsible for the Dave ExtraCash incident (2026-09-11) and
-- the earlier OnePay Advance incident (2026-08-24): two balance-changing
-- calls close together each compute from the same stale snapshot and the
-- second silently overwrites the first instead of adding to it.
--
-- A plain `UPDATE ... SET col = col + $1 WHERE id = $2` is atomic in
-- Postgres — the row is locked for the statement's duration, and every
-- column reference on the right-hand side of the SET list evaluates
-- against the pre-update row, so concurrent calls against the same row
-- always serialize and each sees the other's already-committed effect.
-- These two functions fold each hook's *entire* debt-row update (not just
-- remaining_balance) into one such atomic statement, so every conditional
-- field it depends on (minimum_payment mirroring, ADR-066 reactivation,
-- the payoff-date patch) is computed from the same atomic snapshot too.
--
-- NOT covered (deliberately, see the accompanying GitHub issue): the
-- in-cycle branch of applyClearedPayment (payments.ts) — normal debt
-- payment logging, with its shortfall/cycle-satisfied/arrears/due-date-roll
-- branching. That's a materially bigger rewrite (real cycle-state
-- transitions, not a pure additive delta) and deserves its own careful
-- pass rather than being folded in here. useReversePayment is also
-- unconverted — reversals are one-off, user-invoked per specific
-- transaction, not a realistic race target.

begin;

-- Mirrors useCreateAdvance's debt-row update (data-hooks.ts).
create or replace function public.apply_debt_advance(
  p_debt_id uuid,
  p_amount numeric,
  p_next_due_date_if_blank date default null
)
returns public.debts
language plpgsql
security invoker
as $$
declare
  result public.debts;
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'apply_debt_advance: amount must be positive';
  end if;

  update public.debts
  set
    remaining_balance = greatest(0, remaining_balance + p_amount),
    -- ADR-056 addendum: minimum_payment always mirrors remaining_balance
    -- for debt_type='advance'.
    minimum_payment = case
      when debt_type = 'advance' then greatest(0, remaining_balance + p_amount)
      else minimum_payment
    end,
    -- ADR-066: an advance against a paid-off advance-type debt reactivates
    -- it in the same write (fresh cycle).
    date_paid_off = case
      when debt_type = 'advance' and date_paid_off is not null then null
      else date_paid_off
    end,
    payment_status = case
      when debt_type = 'advance' and date_paid_off is not null then 'unpaid'
      else payment_status
    end,
    cycle_paid_to_date = case
      when debt_type = 'advance' and date_paid_off is not null then 0
      else cycle_paid_to_date
    end,
    -- ADR-056 addendum: fill a still-blank due date once from the caller's
    -- computed next-paycheck date. Never overwrites an existing one, and
    -- the blank-check itself is now atomic (reads the live row, not a
    -- stale client snapshot).
    next_due_date = case
      when debt_type = 'advance'
        and lower(coalesce(billing_cycle, '')) = 'biweekly'
        and next_due_date is null
        and p_next_due_date_if_blank is not null
      then p_next_due_date_if_blank
      else next_due_date
    end
  where id = p_debt_id
  returning * into result;

  if not found then
    raise exception 'apply_debt_advance: debt % not found or not visible', p_debt_id;
  end if;

  return result;
end;
$$;

-- Mirrors useAddDebtAdjustment's debt-row update, and doubles as
-- useLogDebtPayment's "historical, out-of-cycle" branch (payments.ts) —
-- same shape, just a negative p_amount for a payment instead of positive
-- for an adjustment.
create or replace function public.apply_debt_adjustment(
  p_debt_id uuid,
  p_amount numeric,
  p_effective_date date default current_date
)
returns public.debts
language plpgsql
security invoker
as $$
declare
  result public.debts;
begin
  if p_amount is null or p_amount = 0 then
    raise exception 'apply_debt_adjustment: amount must be non-zero';
  end if;

  update public.debts
  set
    remaining_balance = greatest(0, remaining_balance + p_amount),
    minimum_payment = case
      when debt_type = 'advance' then greatest(0, remaining_balance + p_amount)
      else minimum_payment
    end,
    -- debtPayoffDatePatch (debt-payoff-state.ts): advance debts never set
    -- date_paid_off here; others record it once balance reaches ~0, clear
    -- it again if a later adjustment brings the balance back above 0.
    date_paid_off = case
      when debt_type = 'advance' then date_paid_off
      when greatest(0, remaining_balance + p_amount) <= 0.005
        then coalesce(date_paid_off, p_effective_date)
      else null
    end
  where id = p_debt_id
  returning * into result;

  if not found then
    raise exception 'apply_debt_adjustment: debt % not found or not visible', p_debt_id;
  end if;

  return result;
end;
$$;

commit;
