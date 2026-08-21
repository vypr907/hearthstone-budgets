# Open items

## Known issues

- [ ] One-time data fix, user must run in Supabase SQL Editor (found live via MCP,
      2026-08-21 — stale pre-ADR-056-addendum data, not a current code bug):
      `update debts set minimum_payment = remaining_balance where debt_type = 'advance'
      and minimum_payment <> remaining_balance;` — currently affects at least
      Instacash (MoneyLion) and OnePay Advance.
- [ ] Beiers bill's cycle_paid_to_date is desynced (stranded from the Transactions-edit
      gap closed 2026-08-20, ADR-037 addendum) — open the Bills screen and use the
      "Stranded bill payments found" panel's new "Credit now" button (ADR-077) to catch
      it up without losing the transaction. Also spot-check the Rent (via Flex) bill:
      its cleared linked transactions ($2,309) sum well above cycle_paid_to_date
      ($1,250) against a $1,700 due, though that may just be multiple already-rolled
      cycles' worth of history rather than a real desync — confirm before touching it.
- [ ] ADR-066: re-advancing a paid-off advance-type debt — re-checked 2026-08-21, the
      write path (`useCreateAdvance`) and the Debts screen's `isPaidOff` filter both
      look correct against current code. MoneyLion Instacash (the original repro) isn't
      even currently paid off (remaining_balance $600) and hasn't been touched since
      before the 2026-08-19 fix, so the original report may already be resolved —
      needs a live re-test (pay a debt off, re-advance it, confirm it un-hides) rather
      than more static reading.

## Tests

- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.
- [ ] Run the full suite (blocked locally by AppLocker) and confirm everything passes:
      ADR-008 netting, ADR-075 late-payment tagging, the ADR-057 fixture fix, and the
      new ADR-076 (`priorCyclesArrears`/`arrearsPaymentTag`/monthly payment_status)
      tests in `arrears.test.ts`.

## Follow-up work

- [ ] Revisit Past Due grouping as a true 3-way split now that ADR-068 labels rows Deduction-funded vs HSA-funded — the grouping itself is still binary (`debts.is_paycheck_deduction` only; bills have no equivalent field).
- [ ] ADR-049/076 gap: the first "Log arrears payment" on a payable whose CURRENT cycle is also overdue drops that cycle's own amount from the past-due total (`applyArrearsPayment` sets `arrears_as_of = today`, whose cutoff suppresses a prefix of the cycle walk starting at the current cycle, while `opening_arrears` only carries the later missed cycles). Needs an ADR decision on the as-of/opening_arrears representation before coding.
- [ ] Cosmetic: an advance debt reactivated by a new advance (ADR-066) keeps a stale "Cleared" chip / "% paid off" until the next status write.

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
