-- 2026-10-14 — Backfill missing mirror transactions for Dave ExtraCash's
-- two pre-existing "Overdraft Fee" adjustments (ADR-111 addendum).
--
-- These two debt_adjustments rows (adjustment_type='other', $5.00 each,
-- dated 2026-09-04) predate/bypassed the ADR-102 mirroring convention —
-- mirror_transaction_id is null on both, so the Dave ExtraCash account's
-- own transaction history has no record of them, even though
-- useAddDebtAdjustment has mirrored every adjustment since. The ADR-111
-- episode view now includes an unmirrored adjustment directly in its Fees
-- total either way, so this isn't required for the view to show the right
-- numbers — it's a data-completeness fix, so the account's own ledger
-- matches what useAddDebtAdjustment would have written had it mirrored
-- these two at the time, in case this account is ever cross-checked
-- against a real Dave statement.
--
-- Our Household (cd8bce8c-81af-4302-8019-113e352ed443):
--   debt                 Dave ExtraCash   da042cbb-9173-46ab-8c8d-376dab131600
--   linked account        Dave ExtraCash   e62e92f6-5029-4ce2-b28c-23c3db6dc50e
--   debt_adjustments      a5c12d6c-c5e6-4c05-b6f5-1cfcee894d42  ($5.00, 2026-09-04)
--                          9e284c95-2d99-4049-8a2f-9f8d43672f8c  ($5.00, 2026-09-04)

begin;

insert into public.transactions
  (id, household_id, account_id, amount, status, description, transaction_date)
values
  ('6bc4327d-9269-4388-aeaf-89076d76d811', 'cd8bce8c-81af-4302-8019-113e352ed443',
   'e62e92f6-5029-4ce2-b28c-23c3db6dc50e', -5.00, 'cleared', 'Overdraft Fee', '2026-09-04'),
  ('446f0621-87be-49b5-bd47-60c1cf59dc11', 'cd8bce8c-81af-4302-8019-113e352ed443',
   'e62e92f6-5029-4ce2-b28c-23c3db6dc50e', -5.00, 'cleared', 'Overdraft Fee', '2026-09-04');

update public.debt_adjustments
set mirror_transaction_id = '6bc4327d-9269-4388-aeaf-89076d76d811'
where id = 'a5c12d6c-c5e6-4c05-b6f5-1cfcee894d42';

update public.debt_adjustments
set mirror_transaction_id = '446f0621-87be-49b5-bd47-60c1cf59dc11'
where id = '9e284c95-2d99-4049-8a2f-9f8d43672f8c';

commit;
