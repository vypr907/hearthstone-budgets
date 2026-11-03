-- Verify 2026-11-03-venmo-reconcile-sep-oct.sql landed correctly.

-- 1. Row count sanity: Venmo - Steven should now have 437 + ~152 new rows
-- (152 top-level inserts + the legs inside the transfer/advance do-blocks).
select count(*) from public.transactions
where account_id = '9a1a0f9a-c966-4038-a108-36766faf83d3';

-- 2. 10 new institutions landed.
select id, name, institution_type from public.institutions
where id in (
  '497e3f9a-7676-44e0-b109-7cc5dc3b0158', 'c8205f75-7c4f-4ded-a4bd-e2dc2be2c48d',
  '3d5214ec-5d9c-4550-aa5c-ab954fb61a1c', '6763922d-4dec-4965-83cf-5ab402c0b312',
  'd72ffff2-219a-411b-9fb3-180259ba277f', 'cc8fd269-85ba-42e7-b5e3-436c663341f5',
  '07a0809f-0297-4ffe-b5e8-fa47f833753a', '346fe1d7-584c-48d4-8653-6e743b276e44',
  '892d463c-4194-495e-bfc8-b018be0c5518', '96603bae-e230-49c9-ac5f-3328af700fcc'
);

-- 3. Cleo debt should now read remaining_balance = minimum_payment = 55.00.
select id, name, remaining_balance, minimum_payment from public.debts
where id = '085f2811-f7b3-4491-a32e-869a747dfd4b';

-- 4. Cleo's full ledger for this window — eyeball 3 advances (+55 each,
--    10/15, 10/16, 10/20) and 2 repayments (-55 each, 10/22, 10/31) plus
--    3 express fee rows (-8.99 each, 10/22).
select transaction_date, amount, description from public.transactions
where linked_debt_id = '085f2811-f7b3-4491-a32e-869a747dfd4b'
order by transaction_date;

-- 5. Rent (via Flex) bill payments landed (-100.00 10/25, -724.00 10/30).
select transaction_date, amount, description from public.transactions
where linked_bill_id = 'e51d00e3-ad6e-41c5-9ad4-4e12eb204191'
order by transaction_date desc limit 5;

-- 6. Re-run the reconciler after this is applied and a fresh snapshot pull
-- (see scripts/reconcile-venmo-csv.mjs) — MISSING should drop to 0 for both
-- statements except the 5 deliberately-skipped $100 Instacash rows and the
-- 1 skipped $0.00 Uber row, which will keep showing as "missing" forever
-- (that's expected, not a bug).
