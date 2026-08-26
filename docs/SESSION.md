## Session Notes

- 2026-08-26 — Codespace now has working build/test verification. Established a
  green baseline: `npx tsc --noEmit` clean, `npm run build` succeeds, `npx vitest
  run` all green. One environment fix needed first: `npm install` in the
  Codespace does not pull `@rolldown/binding-linux-x64-gnu` (npm optional-deps
  bug npm/cli#4828 — the lockfile trimmed in commit 3737359 dropped the
  linux-x64 optional bindings), so vitest could not find its native binding.
  Worked around locally with `npm i @rolldown/binding-linux-x64-gnu --no-save`.

  Root cause found later this session: the lockfile is NOT the problem — it
  already carries a correct `@rolldown/binding-linux-x64-gnu` entry
  (`os:[linux] cpu:[x64] optional:true`), and a clean `npm ci` (empty
  node_modules) installs it fine and vitest runs. The broken state came from
  `postCreateCommand` running `npm install` against a node_modules the
  Codespace image had pre-populated from another context → npm's optional-deps
  bug skipped the newly-relevant binding. Fix applied: `.devcontainer`
  `postCreateCommand` changed `npm install` → `npm ci` (wipes node_modules
  first, lockfile-faithful, correct for a container anyway). Lockfile left
  untouched — regenerating it would have changed nothing.

- 2026-08-26 — Added `src/lib/paycheck-budget.test.ts`: 13 unit tests for
  `projectOccurrences()` (ADR-060). Covers monthly + biweekly (the two the TODO
  named), plus: never returns the stored due date, throughDate inclusivity,
  empty result when the next occurrence is past the window, unset-cycle →
  monthly default, one-time skip, missing from-date, time-component slicing,
  custom cycle by interval days, custom cycle with no interval → empty, quarterly,
  and a characterization test for shiftDate's inherited month-end clamping.
  Suite now 41 tests (was 28). tsc clean, build unaffected (tests excluded).
  Files touched: `src/lib/paycheck-budget.test.ts` (new). ADR-060.
  Closes the "Add unit tests for projectOccurrences()" TODO item.
  Next step: await user input on the remaining TODO items that need decisions
  (reset-cycle vs bill_adjustments; 3-way Past Due split) and on interactive/
  device smoke tests for the 2026-08-24/25 + ADR-081 batches.

- 2026-08-26 — #2 (2026-08-24 fixes) verified against live data via read-only
  MCP + code trace:
  - Dashboard overdue guard: CONFIRMED. Student Loan 1 & 2 (`remaining_balance`
    0, `date_paid_off` 2026-07-31) resolve to $0 in the Dashboard `overdue`
    array — the `!paidOff` guard (app.index.tsx:570/574) forces the
    `isDateOverdue` fallback to 0; without it each would show $50
    (`debtRemainingOwed` = `minimum_payment`). OnePay Advance:
    `remaining_balance` 231.75, `date_paid_off` null, `next_due_date`
    2026-09-07 — not paid off, shows its open balance, correctly absent from
    Past Due.
  - `applyClearedPayment` date threading: code confirmed (payments.ts:189
    stamps the payment's own `date`). No live trace available — the Student
    Loans' `date_paid_off` was set by migration (updated_at 2026-07-28
    precedes it), not by the payment flow.
  - Out-of-order backfill warning: code confirmed and wired
    (app.debts.tsx:1244, called at 1271 for adjustments + 1301 for advances);
    compares against max(adjustment dates, linked-tx dates); non-blocking.
  Interactive/device checks for #1 and the backdate-warning UX still on the user.

- 2026-08-26 — #6 fixed (stale "Cleared" chip on a re-advanced advance debt).
  New pure helper `advanceReactivationPatch(debt)` in `src/lib/payments.ts`:
  for a paid-off advance-type debt it returns
  `{ date_paid_off: null, payment_status: "unpaid", cycle_paid_to_date: 0 }`
  (empty patch otherwise). `useCreateAdvance` (`src/lib/data-hooks.ts`) now
  spreads it into the debts UPDATE instead of only clearing `date_paid_off`,
  so the Debts-list status Badge (bound to raw `payment_status`,
  app.debts.tsx:305) stops showing "cleared" on a reactivated debt. New
  `src/lib/payments.test.ts` (5 tests, also covers the previously-untested
  `advanceMinimumPaymentPatch`). ADR-066. tsc clean.

- 2026-08-26 — #4 fixed (reset-cycle silently dropped bill_adjustments — the
  Beiers "Credit now" bug). New pure `rebuiltCycleAmountDue(bill, adjustments,
  dueDate)` + private `fetchBillAdjustments()` in `src/lib/payments.ts`. Both
  `useResetCycle` and `useMarkUnpaid` (bill branches) now rebuild
  `cycle_amount_due` from `bill.amount` + the sum of `affects_balance`
  adjustments dated within the restored cycle (one-interval band around the
  due date, `deriveCycleInfo`-style half-open window) instead of writing null.
  Returns null (→ old behavior) for a plain bill / variable bill / read
  failure. "Resolved" resets anchor the band on the reversed due date. No
  schema change. 12 unit tests added to `payments.test.ts` (suite 41 → 58).
  ADR-058 2026-08-26 addendum written. tsc + build + tests green.
  Files: `src/lib/payments.ts`, `src/lib/payments.test.ts`, `docs/DECISIONS.md`.

- 2026-08-26 — #3 (ADR-081 auto-transfers) code-reviewed. `deriveAutoTransferState`
  handles early/on-time/late/resolved processing correctly. Write-path concerns
  logged for the user (see terminal): (1) medium — `useProcessAutoTransfer`
  advances `next_due_date` before writing the legs, so a failed credit-leg insert
  silently skips the cycle + orphans the debit; (2-5) low — no server-side
  double-process guard, transfer always dated today (no backdate), inactive
  auto-transfers still show a live Process button in the Bills list, same-day
  undo is non-deterministic.

- 2026-08-26 — #3 finding 1 fixed. `useProcessAutoTransfer`
  (`src/lib/auto-transfers.ts`) now writes both transfer legs first and advances
  `next_due_date` last (was: date first). A failed date advance now leaves a
  complete, correctly-tagged pair that reads as "cleared" instead of a
  silently-skipped cycle + orphan debit. ADR-081 2026-08-26 addendum written.
  Findings 2-5 (double-process guard, backdate, inactive-list filter, same-day
  undo) left for the user to prioritise. tsc + tests green.

- 2026-08-26 — ADR-082 drafted (new, `docs/DECISIONS.md`): explicit
  `income_source_deductions.kind` enum (payroll/hsa/fsa/other) + 3-way Dashboard
  Past Due grouping. Status "Not implemented" — needs the migration run first
  (SQL is in the ADR).

- 2026-08-26 — ADR-038 addendum implemented (warn-and-allow on a repeat
  same-month Set Aside). New pure `priorSetAsideThisMonth(transactions,
  billName, goalId, today)` in `src/lib/format.ts` — finds the credit leg of a
  Set Aside already made for this bill's envelope this calendar month
  (`linked_goal_id` match + `"Set aside: <bill> ->"` prefix + same YYYY-MM).
  `SetAsideAction.confirm()` `window.confirm()`s before writing when one
  exists. New `src/lib/format.test.ts` (8 tests). Suite 58 → 66. No schema
  change. tsc + build + tests green. Files: `src/lib/format.ts`,
  `src/lib/format.test.ts`, `src/components/SetAsideAction.tsx`,
  `docs/DECISIONS.md`.
