# Open items

## Follow-up work

- [ ] Bug found 2026-08-21, not yet fixed: resetting/undoing a bill's cycle
      (`useResetCycle`/`useMarkUnpaid`) writes `cycle_amount_due: null` unconditionally,
      with no awareness of any active `bill_adjustments` — silently drops an
      adjustment's effect on what's actually due (this is how Beiers got into its
      "Credit now" bug). Needs its own look at how adjustments should survive a
      reset — recompute from adjustments on reset, or block reset while one is active?
- [ ] Revisit Past Due grouping as a true 3-way split now that ADR-068 labels rows Deduction-funded vs HSA-funded — the grouping itself is still binary (`debts.is_paycheck_deduction` only; bills have no equivalent field).
- [ ] Cosmetic: an advance debt reactivated by a new advance (ADR-066, confirmed does NOT reproduce as a real bug 2026-08-21) keeps a stale "Cleared" chip / "% paid off" until the next status write.
- [ ] Add unit tests for `projectOccurrences()` (monthly + biweekly items) alongside the existing arrears tests.

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] No guard against two Set Aside entries for the same bill in the same month (ADR-038 known gap).
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
