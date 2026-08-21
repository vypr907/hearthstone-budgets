# Open items

## Known issues

- [ ] ADR-078: run in the Supabase SQL Editor —
      `alter table bills add column if not exists arrears_paid_to_date numeric default 0;`
      `alter table debts add column if not exists arrears_paid_to_date numeric default 0;`
      `notify pgrst, 'reload schema';`
      Code (arrears.ts, payments.ts) already written and expects this column to exist.
- [ ] ADR-079: run in the Supabase SQL Editor — the `set_updated_at()` trigger function
      + triggers on `bills`/`debts` (see docs/DECISIONS.md ADR-079 for the full SQL).
      No app code depends on writing this migration first; safe to run anytime.
- [ ] Beiers bill: "Credit now" was rejecting the real $108.39 cleared payment because
      `cycle_amount_due` had been reset to null (dropping the $20 late-fee adjustment
      that was correctly applied when added) and `next_due_date` had drifted to
      2026-09-01 instead of the still-open 2026-08-01. One-time fix given to the user
      2026-08-22:
      `update bills set next_due_date = '2026-08-01', cycle_amount_due = 108.39
      where id = 'abc22035-dac6-4097-bf7a-63c144446242';`
      — run that, then retry "Credit now". Also spot-check the Rent (via Flex) bill:
      its cleared linked transactions ($2,309) sum well above cycle_paid_to_date
      ($1,250) against a $1,700 due, though that may just be multiple already-rolled
      cycles' worth of history rather than a real desync — confirm before touching it.

## Follow-up work

- [ ] Bug found 2026-08-22, not yet fixed: resetting/undoing a bill's cycle
      (`useResetCycle`/`useMarkUnpaid`) writes `cycle_amount_due: null` unconditionally,
      with no awareness of any active `bill_adjustments` — silently drops an
      adjustment's effect on what's actually due (this is how Beiers got into the
      "Credit now" bug above). Needs its own look at how adjustments should survive a
      reset — recompute from adjustments on reset, or block reset while one is active?
- [ ] Revisit Past Due grouping as a true 3-way split now that ADR-068 labels rows Deduction-funded vs HSA-funded — the grouping itself is still binary (`debts.is_paycheck_deduction` only; bills have no equivalent field).
- [ ] Smoke-test ADR-078 once the SQL migration is run: a partial "Log arrears payment" on a payable whose current cycle is also overdue should leave the current cycle's own amount in the past-due total (e.g. $300 raw, $50 paid → $250, not $150 — the bug QA found in ADR-076's original opening_arrears/arrears_as_of routing).
- [ ] Cosmetic: an advance debt reactivated by a new advance (ADR-066, confirmed does NOT reproduce as a real bug 2026-08-21) keeps a stale "Cleared" chip / "% paid off" until the next status write.
- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
