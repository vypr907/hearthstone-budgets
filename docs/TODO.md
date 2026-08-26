# Open items

## Follow-up work

- [ ] 2026-08-25 budget visualization overhaul (ring color rules via
      `budgetRingColor()`, pending-amount amber bar segments, tappable
      split-line detail rows, deduction-funded split line, zero-budget
      "$X spent" label fix) and the Bills list card redesign need a
      build/browser (or real-phone) check — same AppLocker constraint as
      below. This landed after the FAB-overlap/tile-truncation mobile fixes,
      which appear to have already been iterated on and fixed directly
      (see "Fixed debt detail overflow"/"Fixed amount tile overflow" in git
      log) — no need to re-verify those specifically unless new overlap
      issues show up.
- [ ] 2026-08-24 fixes: verified 2026-08-26 via MCP + code trace (see CHANGELOG).
      Remaining: click-test the out-of-order backfill warning UX (backdate a debt
      adjustment/advance before existing history → confirm the non-blocking
      warning appears).
- [ ] ADR-081 (Auto-Transfer tracking): compiles + code-reviewed 2026-08-26
      (findings addressed — write-order fix landed). Still needs an end-to-end
      run: add a real (or throwaway) auto-transfer, hit "Process transfer," and
      confirm the transaction pair lands with the right
      signs/`transfer_group_id`/`linked_auto_transfer_id`, `next_due_date`
      advances, and it shows on Paycheck Budget/Dashboard totals.

- [ ] 2026-08-26 reset-vs-adjustments fix (`rebuiltCycleAmountDue`, ADR-058
      addendum) is unit-tested but wants one end-to-end check: add a +$ bill
      adjustment, pay the cycle, undo it, confirm `cycle_amount_due` still
      reflects the adjustment (not just `bills.amount`).
- [ ] ADR-082 (3-way Past Due grouping + `income_source_deductions.kind`):
      approved + drafted 2026-08-26. BLOCKED on the user running the migration
      (SQL block in the ADR). Once run: add the "Kind" picker to the
      income-source deduction dialog, replace `fundingLabel()`'s regex with the
      column, and make the Dashboard Past Due grouping three-way
      (`src/lib/deduction-funding.ts` helper + `app.index.tsx`).

## Standing open items

- [ ] Re-tag older transactions with a place (`institution_id`) so Spending by place totals are complete — can be done from TransactionDetail edit mode.
- [ ] Accounts and Institutions detail dialogs remain screen-specific (investigated 2026-08-11, no shared component warranted — closed as designed).
- [ ] Payment Schedule: past months show no per-debt breakdown by design; check-off only.
