# Open items

## Known issues

- [ ] ADR-075: run `alter table transactions add column resolved_cycle_due_date date;`
      in the Supabase SQL Editor, then reload schema. Code (payments.ts, ledger-state.ts)
      is already written and expects this column to exist.
- [ ] Beiers bill's cycle_paid_to_date is desynced (stranded from the Transactions-edit
      gap closed 2026-08-20, ADR-037 addendum) — open the Bills screen and use the new
      "Stranded bill payments found" panel to clean it up and redo the payment. Also
      spot-check the Rent (via Flex) bill: its cleared linked transactions ($2,309) sum
      well above cycle_paid_to_date ($1,250) against a $1,700 due, though that may just
      be multiple already-rolled cycles' worth of history rather than a real desync —
      confirm before touching it.
- [ ] ADR-066: re-advancing a paid-off advance-type debt (e.g. MoneyLion Instacash) still hides it instead of reactivating — confirmed still reproducing as of 2026-08-19 despite `useCreateAdvance` being touched again since (minimum_payment/next_due_date sync, ADR-056 addendum — unrelated to this bug). Needs a fresh diagnosis pass against current code, not another assumption-based read.
- [ ] `computeArrears()` (`arrears.ts`) ignores `payment_status` for monthly debts — a monthly debt cleared after its `due_day` has passed this month shows "1 cycle past due" via `PastDueBadge` regardless of `payment_status='cleared'`. Surfaced 2026-08-19 during the TSP loan deduction backfill; worked around per-debt via `arrears_as_of`, not fixed at the code level. Revisit if it recurs on other monthly debts.

## Tests

- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.
- [ ] Fix the pre-existing `arrears.test.ts` opening-arrears failure (unrelated to recent work, still red).
- [ ] Run the suite (blocked locally by AppLocker) to confirm both `ledger-state.test.ts` regression groups pass — the ADR-008 netting test, and the new ADR-075 late-payment tagging tests — and verify live: reverse a cleared bill payment (state should drop back to `unpaid`/`partial`), and pay a bill one day late (the next cycle should show Submit, not Reset, once the SQL migration is run).

## Follow-up work

- [ ] Revisit Past Due grouping as a true 3-way split now that ADR-068 labels rows Deduction-funded vs HSA-funded — the grouping itself is still binary (`debts.is_paycheck_deduction` only; bills have no equivalent field).
- [ ] Smoke-test today's UI changes on device/Lovable (build unverified locally, AppLocker): Bills screen shows Beiers under "Stranded bill payments found" and "Clean up" works; Bill detail's Recent Transactions rows show the paying account and open `TransactionDetail` on tap.

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
