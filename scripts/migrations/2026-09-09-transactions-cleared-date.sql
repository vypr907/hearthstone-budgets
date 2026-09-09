-- 2026-09-09 — Add transactions.cleared_date (ADR-100).
--
-- transaction_date has always meant "when this was logged/submitted" — but
-- a bank statement only ever shows the date a transaction actually posted,
-- which can be days later for anything entered as pending first. This adds
-- a second, nullable date: null for a still-pending row, populated for
-- every cleared row (backfilled here for existing rows, set going forward
-- by the app whenever a transaction is written or transitions to cleared).
--
-- No schema constraint beyond nullable — verified live via MCP before
-- writing this (transactions has no check constraint that would need
-- widening, unlike the institution_type surprise earlier this session).

begin;

alter table public.transactions add column if not exists cleared_date date;

update public.transactions set cleared_date = transaction_date
  where status = 'cleared' and cleared_date is null;

commit;

notify pgrst, 'reload schema';
