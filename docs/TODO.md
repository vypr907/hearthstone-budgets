# Open items

## Known issues

- [ ] ADR-078: run in the Supabase SQL Editor —
      `alter table bills add column if not exists arrears_paid_to_date numeric default 0;`
      `alter table debts add column if not exists arrears_paid_to_date numeric default 0;`
      `notify pgrst, 'reload schema';`
      Code (arrears.ts, payments.ts) already written and expects this column to exist.
- [ ] Beiers bill's cycle_paid_to_date is desynced (stranded from the Transactions-edit
      gap closed 2026-08-20, ADR-037 addendum) — open the Bills screen and use the
      "Stranded bill payments found" panel's "Credit now" button (ADR-077, QA-verified
      2026-08-21) to catch it up without losing the transaction. Also spot-check the
      Rent (via Flex) bill: its cleared linked transactions ($2,309) sum well above
      cycle_paid_to_date ($1,250) against a $1,700 due, though that may just be
      multiple already-rolled cycles' worth of history rather than a real desync —
      confirm before touching it.

## Follow-up work

- [ ] Revisit Past Due grouping as a true 3-way split now that ADR-068 labels rows Deduction-funded vs HSA-funded — the grouping itself is still binary (`debts.is_paycheck_deduction` only; bills have no equivalent field).
- [ ] Smoke-test ADR-078 once the SQL migration is run: a partial "Log arrears payment" on a payable whose current cycle is also overdue should leave the current cycle's own amount in the past-due total (e.g. $300 raw, $50 paid → $250, not $150 — the bug QA found in ADR-076's original opening_arrears/arrears_as_of routing).
- [ ] Cosmetic: an advance debt reactivated by a new advance (ADR-066, confirmed does NOT reproduce as a real bug 2026-08-21) keeps a stale "Cleared" chip / "% paid off" until the next status write.
- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
