-- 2026-10-14 — Linked advance debts: stop apply_debt_advance/
-- apply_debt_adjustment compounding onto a stale stored remaining_balance
-- (ADR-102 addendum). SCHEMA CHANGE: both functions gain one new optional
-- trailing parameter (default null) — fully backward compatible, every
-- existing caller that never passes it gets byte-for-byte unchanged
-- behavior.
--
-- Found live: taking a new $100 advance + $10 fee against Dave ExtraCash
-- (a LINKED advance debt, ADR-102) pushed minimum_payment to $140 instead
-- of the expected $110. Both RPCs always add onto whatever
-- debts.remaining_balance currently holds — correct for an unlinked
-- advance debt (the stored column IS the trusted balance there), but once
-- a debt is linked, effectiveDebtBalance()/useEffectiveDebts() (balances.ts,
-- data-hooks.ts) derive the real number from the linked account instead,
-- and nothing ever syncs the stored column back — it drifted to a stale
-- $30, and the new advance additively landed on top of that garbage
-- (30 + 100 + 10 = 140).
--
-- Fix: a new p_current_balance_override parameter. The client
-- (useCreateAdvance/useAddDebtAdjustment, useLogDebtPayment's historical
-- branch — src/lib/data-hooks.ts, src/lib/payments.ts) computes the real
-- current balance via effectiveDebtBalance()'s own logic
-- (creditOwed(balanceAsOf(...))) whenever the debt is linked, and passes
-- it in; the RPC uses coalesce(p_current_balance_override, remaining_balance)
-- as its baseline instead of the bare (sometimes stale) column. Omitted
-- entirely for an unlinked debt, so nothing changes there.
--
-- Also: apply_debt_advance's due-date fill was "once ever, only if blank"
-- (ADR-056 addendum) — a brand-new advance against an already-settled
-- debt never got its own due date, which is how Dave's stale 2026-09-24
-- date lingered into the past and tripped a false "past due." Widened to
-- also reset when the (possibly-overridden) baseline balance is ~0 —
-- i.e. the prior advance, if any, was already fully settled — not just
-- when next_due_date was literally null.

begin;

create or replace function public.apply_debt_advance(
  p_debt_id uuid,
  p_amount numeric,
  p_next_due_date_if_blank date default null,
  p_current_balance_override numeric default null
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
    remaining_balance = greatest(0, coalesce(p_current_balance_override, remaining_balance) + p_amount),
    -- ADR-056 addendum: minimum_payment always mirrors remaining_balance
    -- for debt_type='advance'.
    minimum_payment = case
      when debt_type = 'advance' then greatest(0, coalesce(p_current_balance_override, remaining_balance) + p_amount)
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
    -- ADR-056 addendum, widened 2026-10-14 (ADR-102 addendum): fill a blank
    -- due date as before, OR reset it when the prior balance was already
    -- ~0 (this draw starts a fresh cycle against an otherwise-settled
    -- debt) — not just a one-time-ever fill. Still never fires for a debt
    -- with real, still-outstanding prior balance.
    next_due_date = case
      when debt_type = 'advance'
        and lower(coalesce(billing_cycle, '')) = 'biweekly'
        and p_next_due_date_if_blank is not null
        and (next_due_date is null or coalesce(p_current_balance_override, remaining_balance) <= 0.005)
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

create or replace function public.apply_debt_adjustment(
  p_debt_id uuid,
  p_amount numeric,
  p_effective_date date default current_date,
  p_current_balance_override numeric default null
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
    remaining_balance = greatest(0, coalesce(p_current_balance_override, remaining_balance) + p_amount),
    minimum_payment = case
      when debt_type = 'advance' then greatest(0, coalesce(p_current_balance_override, remaining_balance) + p_amount)
      else minimum_payment
    end,
    -- debtPayoffDatePatch (debt-payoff-state.ts): advance debts never set
    -- date_paid_off here; others record it once balance reaches ~0, clear
    -- it again if a later adjustment brings the balance back above 0.
    date_paid_off = case
      when debt_type = 'advance' then date_paid_off
      when greatest(0, coalesce(p_current_balance_override, remaining_balance) + p_amount) <= 0.005
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

-- One-time data fix: Dave ExtraCash's row already drifted through the old
-- (buggy) RPC before this migration landed, so it can't retroactively
-- re-run through the fixed version. Corrects it directly to what the new
-- advance should have produced: $100 advance + $10 fee against a $0 prior
-- balance = $110, due one cycle out from the 2026-10-07 draw = 2026-10-22.
update public.debts
set
  remaining_balance = 110.00,
  minimum_payment = 110.00,
  next_due_date = '2026-10-22'
where id = 'da042cbb-9173-46ab-8c8d-376dab131600';

commit;
