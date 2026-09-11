-- 2026-09-11 — Debt <-> account linking (ADR-102). SCHEMA CHANGE: two new
-- nullable columns, no FK constraint (matches this table's existing
-- convention — `debts` has no FK constraints today), no RLS change.
--
-- `debts.linked_account_id`: the real `accounts` row this debt's balance
-- actually lives on, when one exists (e.g. "Dave ExtraCash" the debt and
-- "Dave ExtraCash" the credit account are the same real-world line of
-- credit, previously connected only by name). null for every debt that has
-- no backing account (e.g. OnePay Advance) — those are unaffected.
--
-- `debt_adjustments.mirror_transaction_id`: when an adjustment writes a
-- mirror transaction onto a debt's linked_account_id (see ADR-102), this
-- points at it so useDeleteDebtAdjustment can clean it up too. null for
-- every adjustment on a debt with no linked_account_id, and for adjustments
-- created before this feature existed.

begin;

alter table public.debts add column if not exists linked_account_id uuid;
alter table public.debt_adjustments add column if not exists mirror_transaction_id uuid;

-- Data: Dave ExtraCash (debt da042cbb) <-> its real credit account (e62e92f6).
update public.debts set linked_account_id = 'e62e92f6-5029-4ce2-b28c-23c3db6dc50e'
where id = 'da042cbb-9173-46ab-8c8d-376dab131600';

commit;
