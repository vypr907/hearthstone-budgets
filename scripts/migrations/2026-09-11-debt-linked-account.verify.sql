-- Verify 2026-09-11-debt-linked-account.sql.

select column_name, data_type from information_schema.columns
where table_name = 'debts' and column_name = 'linked_account_id';
-- expect 1 row, data_type uuid

select column_name, data_type from information_schema.columns
where table_name = 'debt_adjustments' and column_name = 'mirror_transaction_id';
-- expect 1 row, data_type uuid

select linked_account_id from public.debts where id = 'da042cbb-9173-46ab-8c8d-376dab131600';
-- expect e62e92f6-5029-4ce2-b28c-23c3db6dc50e
