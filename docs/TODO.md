# Open items

## Known issues

- [ ] Rent (via Flex) bill: "Credit now" was throwing "exceeds what's owed" for a
      different reason than Beiers/Prose/ATT — see the "Credit now double-credits an
      already-partially-credited bill" bug below. Only $450 of the $1,700 window was
      actually stranded ($1,250 was already correctly credited). One-time direct SQL
      fix given to the user 2026-08-22 (bypasses "Credit now" entirely since the code
      fix isn't deployed yet):
      ```sql
      begin;
      update bills set next_due_date = '2026-09-01', cycle_amount_due = null,
        cycle_paid_to_date = 0 where id = 'e51d00e3-ad6e-41c5-9ad4-4e12eb204191';
      update transactions set resolved_cycle_due_date = '2026-08-01'
        where linked_bill_id = 'e51d00e3-ad6e-41c5-9ad4-4e12eb204191'
        and status = 'cleared' and resolved_cycle_due_date is null;
      commit;
      ```
- [x] ~~Household-wide sweep found 2026-08-22~~ — **false alarm, correcting**: the SQL
      scan that flagged ~15 bills (Aarons Club, Anthropic-Claude, Dave, Flex, Google
      Play Pass, Kikoff, Planet Fitness x2, Starz, Stash-Invest, UberEats, Hulu/Disney+)
      only checked "is there a cleared, untagged transaction bigger than
      `cycle_paid_to_date`" — it didn't replicate `findStrandedBillPayments()`'s actual
      date-windowing (only transactions inside the bill's current cycle window count).
      Hand-traced most of them against the real window logic (2026-08-22): their
      transaction dates land exactly on/before the window's own start boundary, so the
      app correctly excludes them as belonging to an already-superseded cycle — not
      stranded. Confirmed by the user: none of these show in the Stranded panel.
      Trust the app's panel over ad-hoc SQL scans for this going forward.
      - The one flagged exception was real: **SoFi-Invest** wasn't a mis-modeled bill,
        it was a mis-modeled *transfer* — a biweekly Savings -> Robo auto-transfer
        tracked as a Bill, which only ever debits the source account; Robo (the
        investment account) was never credited. Found a real duplicate too (two
        identical $5 debits, same date). One-time SQL fix given to the user
        2026-08-22: delete the duplicate, convert the remaining debit into a real
        transfer (paired credit into Robo via `transfer_group_id`), delete the
        SoFi-Invest bill row (confirmed nothing else references it). Going forward,
        log this and any future auto-transfers via Add Transaction -> Transfer, not
        as a Bill. Not yet confirmed run.

## Follow-up work

- [ ] Bug found 2026-08-22, not yet fixed: resetting/undoing a bill's cycle
      (`useResetCycle`/`useMarkUnpaid`) writes `cycle_amount_due: null` unconditionally,
      with no awareness of any active `bill_adjustments` — silently drops an
      adjustment's effect on what's actually due (this is how Beiers got into its
      "Credit now" bug). Needs its own look at how adjustments should survive a
      reset — recompute from adjustments on reset, or block reset while one is active?
- [ ] Bug found AND fixed 2026-08-22 (needs redeploy + QA re-verify): "Credit now"
      (`StrandedBillRepair`/`StrandedDebtRepair`) passed the group's full `clearedSum`
      to `applyClearedPayment`, which treats it as NEW money on top of
      `cycle_paid_to_date` — double-credited whatever portion of the window was
      already correctly credited. Only visible when `cycle_paid_to_date > 0` at flag
      time (Rent was the first real case). Fixed to credit `clearedSum -
      cycle_paid_to_date` instead. Smoke-test: a bill/debt partially credited with one
      more stranded transaction on top should resolve cleanly via "Credit now" without
      throwing "exceeds what's owed."
- [ ] Revisit Past Due grouping as a true 3-way split now that ADR-068 labels rows Deduction-funded vs HSA-funded — the grouping itself is still binary (`debts.is_paycheck_deduction` only; bills have no equivalent field).
- [ ] Smoke-test ADR-078 once the SQL migration is run: a partial "Log arrears payment" on a payable whose current cycle is also overdue should leave the current cycle's own amount in the past-due total (e.g. $300 raw, $50 paid → $250, not $150 — the bug QA found in ADR-076's original opening_arrears/arrears_as_of routing).
- [ ] Cosmetic: an advance debt reactivated by a new advance (ADR-066, confirmed does NOT reproduce as a real bug 2026-08-21) keeps a stale "Cleared" chip / "% paid off" until the next status write.
- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
