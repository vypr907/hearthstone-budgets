-- Aaron's - Dresser: align app data with lease agreement 33984278 (dated 2026-03-14)
-- Data-only correction. No schema change. Run in the Supabase SQL Editor.
--
-- Lease facts:
--   Madison II Dresser $77.00 + Madison II Mirror $15.04 = $92.04 lease
--   + $5.06 tax = $97.10 monthly renewal x 24 payments = $2,330.40 total cost to own
--   Cash price $1,297.42 (early buyout; NOT the tracked balance)
--   Aaron's Protection Plus ($9.20/mo) is an optional add-on, NOT part of the 24 payments
--   -> stays a fee line (ADR-046: fees never reduce the debt balance)
--
-- Decisions (confirmed 2026-08-31):
--   Balance basis  = total cost to own ($2,330.40)
--   Payment        = $97.10 monthly, tax rolled in
--   Payments made  = 4 (2026-04-23, 05-21, 07-21, 08-21) -> 20 remaining
--   Remaining      = 2330.40 - (4 * 97.10) = 1942.00
--
-- Cash out of the accounts is UNCHANGED by this script: each historical payment
-- row grows by $5.06 and its paired tax fee row shrinks by the same $5.06.

BEGIN;

-- 0) Sanity: this is the dresser debt, household "Our Household".
--    debt_id = 8004b659-7e01-4630-8e76-bea58065ab16

-- 1) Roll the $5.06 tax into each historical principal payment (92.04 -> 97.10).
UPDATE public.transactions
SET amount = -97.10
WHERE linked_debt_id = '8004b659-7e01-4630-8e76-bea58065ab16'
  AND amount = -92.04;

-- 2) Remove the now-redundant standalone tax fee rows (Apr/May/Jul).
DELETE FROM public.transactions
WHERE linked_debt_id IS NULL
  AND split_group_id IN (
    SELECT split_group_id FROM public.transactions
    WHERE linked_debt_id = '8004b659-7e01-4630-8e76-bea58065ab16'
  )
  AND description ILIKE 'Fee: Aarons - Dresser%Tax%';

-- 3) August's single 14.26 fee row was tax 5.06 + Protection Plus 9.20.
--    Strip the tax portion, leaving the protection plan.
UPDATE public.transactions
SET amount = -9.20,
    description = 'Fee: Aarons - Dresser · other — Aaron''s Protection Plus'
WHERE id = (
  SELECT t.id FROM public.transactions t
  WHERE t.linked_debt_id IS NULL
    AND t.amount = -14.26
    AND t.description ILIKE 'Fee: Aarons - Dresser%'
    AND t.split_group_id IN (
      SELECT split_group_id FROM public.transactions
      WHERE linked_debt_id = '8004b659-7e01-4630-8e76-bea58065ab16'
    )
  LIMIT 1
);

-- 4) Restate the debt row to the lease.
UPDATE public.debts
SET starting_balance     = 2330.40,
    program_start_balance = 2330.40,
    remaining_balance    = 1942.00,
    minimum_payment      = 97.10,
    billing_cycle        = 'monthly',
    due_day              = 21,
    payment_day          = 21,
    next_due_date        = '2026-09-21',
    cycle_paid_to_date   = 0,
    payment_status       = 'unpaid',
    interest_rate        = 0,
    plan_payment_count   = 24,
    plan_final_payment   = NULL,
    opening_arrears      = 0,
    notes                = 'Aaron''s lease-purchase agreement 33984278, dated 2026-03-14. '
                           'Madison II Dresser $77.00 + Madison II Mirror $15.04 + tax $5.06 = $97.10/mo x 24 = $2,330.40 total cost to own. '
                           'Cash price $1,297.42 (early buyout). Alternate terms: weekly $22.42 x 104, semi-monthly $48.55 x 48. '
                           'Aaron''s Protection Plus $9.20/mo is an optional add-on billed alongside the renewal and is logged as a fee line, not principal.',
    updated_at           = now()
WHERE id = '8004b659-7e01-4630-8e76-bea58065ab16';

COMMIT;

-- Verify:
-- SELECT starting_balance, remaining_balance, minimum_payment, next_due_date, payment_status
-- FROM public.debts WHERE id = '8004b659-7e01-4630-8e76-bea58065ab16';
-- SELECT transaction_date, amount, description FROM public.transactions
-- WHERE split_group_id IN (SELECT split_group_id FROM public.transactions
--   WHERE linked_debt_id = '8004b659-7e01-4630-8e76-bea58065ab16')
-- ORDER BY transaction_date;
