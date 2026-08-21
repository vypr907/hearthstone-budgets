## Session Notes

- ADR-075: user ran the `resolved_cycle_due_date` migration in the Supabase
  SQL Editor. Verified live via the read-only MCP (`list_tables`) —
  `public.transactions.resolved_cycle_due_date` exists (nullable date). The
  fix is now fully active going forward. Updated ADR-075's status line,
  removed the now-done TODO item, and dropped "pending" from CONTEXT.md's
  Phase 11 bullet.
  - Next step: smoke-test — pay a bill one day late and confirm the next
    cycle shows Submit, not Reset.

- Reviewed docs/TODO.md and docs/SCRATCHPAD.md's "Things to work on" against
  current code before touching anything: several items were already fixed in
  earlier sessions (Dashboard Budget vs Actual scope/label/tooltip, Monthly
  Summary subheader, debt payment date field, Add Transaction auto-labeling)
  and needed no work. Live-checked MoneyLion Instacash/OnePay Advance via the
  read-only MCP for the ADR-066 report — found a real `minimum_payment` vs
  `remaining_balance` desync on both, but traced it to stale pre-ADR-056-
  addendum data (rows untouched since before that fix), not a current code
  bug — gave the user a one-time SQL fix rather than changing code.

- Implemented ADR-076 (arrears-only payments) and ADR-077 ("Correct this
  payment"), both approved after a scoping interview. No schema changes —
  both reuse existing columns.
  - ADR-076: `priorCyclesArrears()`/`arrearsPaymentTag()` (arrears.ts) —
    arrears owed strictly before the current cycle, and the ADR-075 tag to
    exclude an arrears-only transaction from the current cycle's ledger
    window. `applyArrearsPayment`/`useMarkArrearsPaid` (payments.ts) + new
    `ArrearsPaymentAction.tsx`, wired into `PayActions.tsx` so "Log arrears
    payment" shows up everywhere Submit/Reset already does, hidden when
    nothing's owed from before the current cycle. Generalized
    `applyClearedPayment`'s overflow-into-arrears reduction (bills and
    debts) to use `priorArrears` instead of raw `opening_arrears`, removing
    the `opening_arrears > 0` gate that silently no-oped whenever arrears
    came purely from the live missed-cycle walk — this also fixes "Total
    due" overstating what's owed (pay-flow.tsx's preset used the same fixed
    formula). `applyClearedPayment`/`useMarkCleared`/`PayInput` all gained a
    `priorArrears` parameter, computed by the caller (payments.ts can't
    import arrears.ts — arrears.ts already imports from payments.ts); updated
    all 4 call sites (pay-flow.tsx, AddTransactionFab.tsx,
    deduction-funding.ts, app.pending.tsx).
  - ADR-077: `useCorrectPayment` (payments.ts) — edits a cleared, linked
    PARTIAL payment's amount/date/account in place via a `cycle_paid_to_date`
    delta; rejects anything that would cross a resolve boundary either
    direction, pointing at Reverse instead (v1 scope, per user decision). New
    `CorrectPaymentButton.tsx`, wired in next to Reverse/Delete on Bills' and
    Debts' Recent Transactions. `StrandedBillRepair`/`StrandedDebtRepair`
    gained a "Credit now" action alongside "Clean up" — applies a stranded
    group's already-cleared total via `applyClearedPayment` instead of
    deleting the rows and asking for a redo.
  - Also fixed, while in this code: `computeArrears()` (arrears.ts) now
    trusts a monthly debt's `payment_status='cleared'` for its current cycle
    ONLY when `updated_at` is recent enough to plausibly be for that cycle
    (bounded via `shiftDateSafe`) — closes the "cleared but still shows 1
    cycle past due" gap without risking a stale flag hiding a genuinely
    overdue debt. Fixed a test-fixture bug in `arrears.test.ts`'s ADR-057
    test (an `arrears_as_of` value that couldn't produce the scenario the
    test's own comment described — the code was correct, the fixture wasn't).
    Added regression tests for `priorCyclesArrears`, `arrearsPaymentTag`, and
    the monthly payment_status fix.
  - Cleared resolved items out of docs/SCRATCHPAD.md's "Things to work on"
    and the three "## Idea" sections that became ADR-075/076.
  - Next step: draft and hand off the (now small) Lovable prompt — run the
    test suite, then smoke-test everything listed in TODO.md's "Follow-up
    work" section. Build/tests unverified locally (AppLocker).

- QA pass task 1 (2026-08-21): ran the full test suite in the Lovable
  sandbox. `src/lib/arrears.test.ts` 13/13 pass, `src/lib/ledger-state.test.ts`
  10/10 pass (23 tests, 2 files — the only test files in the repo). Build
  reports OK. No failures, no fixes required.
  - Known issue (pre-existing, non-blocking, surfaced in typecheck output):
    `src/lib/monthly-summary.ts:79` and `src/lib/paycheck-budget.ts:281`
    both report TS2871 "This expression is always nullish". Not a
    regression from the ADR-075/076/077 work; logged for a later cleanup.
  - Tasks 2-8 are live smoke tests and are blocked pending a throwaway
    household login — the sandbox cannot mint a session for the
    self-managed Supabase project.
