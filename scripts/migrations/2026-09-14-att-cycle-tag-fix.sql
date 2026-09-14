-- 2026-09-14 — Tag ATT's late-August payment so it stops muddying September's cycle.
--
-- ATT's next_due_date already correctly rolled 8/29 -> 9/29 (confirmed by the
-- user: $216.73 was due 8/29, $222.12 is due 9/29). But the $216.73 payment
-- that resolved the 8/29 cycle was logged a couple days late
-- (transaction_date 2026-09-01) and never got tagged with
-- resolved_cycle_due_date -- most likely because cycle_amount_due wasn't yet
-- correctly $216.73 at the time it cleared, so the normal
-- applyClearedPayment() resolve-and-tag path (ADR-075) never fired for it.
--
-- Confirmed live via the read-only MCP: bills.next_due_date = 2026-09-29
-- (already correct); the only September-dated ATT transaction is that
-- $216.73 row (e7ffe110-73a5-414b-bdad-b0fa7151e38d), resolved_cycle_due_date
-- null. deriveCycleInfo's monthly branch (ADR-086, src/lib/ledger-state.ts)
-- windows the "current" cycle by calendar month, so that untagged Sept-1 row
-- got counted against the real September cycle (due 9/29, $222.12, set via
-- "Set amount owed this cycle" -- ADR-058 addendum) -- showing a false $5.39
-- "still owed" on a cycle the user hasn't paid a cent toward yet.
--
-- Tagging the transaction 2026-08-29 (the due date it actually resolved)
-- excludes it from September's window via the `eligible` filter
-- (ledger-state.ts, ADR-075/086 -- `tagged >= monthStart` fails for a
-- monthly item once tagged with an earlier due date), exactly as a
-- normally-tagged late payment would behave. Also resets
-- bills.cycle_paid_to_date to 0 -- it currently double-counts the same
-- $216.73 against the September target, which feeds useLogBillPayment's
-- remaining-this-cycle cap check (payments.ts). payment_status moves back to
-- 'unpaid' to match. cycle_amount_due / next_due_date are left alone -- both
-- are already correct for September.
--
-- next_due_date is in the future (9/29) and arrears.ts walks arrears off
-- that same stored pointer, so this doesn't create any phantom "past due"
-- balance -- the August cycle is simply, correctly, already paid.
--
-- No schema change, no ADR (data-only correction; same bug shape and fix
-- pattern as scripts/migrations/2026-09-09-gci-cycle-fix.sql).

begin;

update public.transactions
set resolved_cycle_due_date = '2026-08-29'
where id = 'e7ffe110-73a5-414b-bdad-b0fa7151e38d';

update public.bills
set
  cycle_paid_to_date = 0,
  payment_status = 'unpaid'
where id = '34e2fb44-45ca-47fc-bb7c-01ef2bcff211';

commit;
