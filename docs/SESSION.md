# SESSION.md

## Session Notes

- Submit Payment (debt detail screen) now supports itemized, multi-line fees
  (type dropdown + amount + free-text note per line), replacing its single
  bare fee-amount field — brings it to parity with "Log a Payment to this
  debt," which already had this. Added "Tax" as a new line type shared by all
  three fee-entry dialogs. ADR-046 addendum (docs/DECISIONS.md).
  Files: `src/lib/payments.ts` (shared `LINE_TYPES`/`PaymentLineDraft`/
  `newPaymentLine`, new `insertFeeLines`, `PayInput.feeLines` replacing
  `.fee`, `useMarkSubmitted`/`useMarkCleared` updated), `src/lib/pay-flow.tsx`
  (multi-line fee UI), `src/components/LogDebtPaymentDialog.tsx` and
  `LogBillPaymentDialog.tsx` (de-duplicated to import the shared constants).
  `tsc --noEmit` clean, 274/274 tests pass. Not yet checked in a running
  browser (no reachable dev server in this sandbox — needs a Codespace or
  real terminal).
  Next: verify in a browser (Submit Payment with 2+ charge lines including a
  Tax line; clear/undo/reset the group; confirm cycle/balance/Year-in-review
  totals unaffected).

- Added per-debt fee-line templating (ADR-112): a new `debts.default_fee_lines`
  jsonb column (migration run by the user, confirmed live via the read-only
  MCP) backs a "Save as default" action in both Submit Payment and Log a
  Payment, and both dialogs now pre-fill their lines from it when opened for
  a debt that has one set. Files: `src/lib/supabase.ts` (`Debt.
  default_fee_lines`), `src/lib/payments.ts` (`draftsFromDefaultLines`,
  `useSaveDefaultFeeLines`), `src/lib/pay-flow.tsx`, `src/components/
  LogDebtPaymentDialog.tsx`. `tsc --noEmit` clean, 274/274 tests pass.
  Next: verify end-to-end in a browser — set a default on a debt, reopen
  Submit Payment / Log a Payment and confirm it pre-fills, edit and re-save
  the default, clear it by saving with no lines.

- Editing an existing payment's fee lines (`LinkedGroupDetail`,
  `src/routes/app.transactions.tsx`) now has the same Type dropdown + Note
  field as Submit Payment/Log a Payment, instead of just a category picker
  and amount with no way to see/edit a line's note at all. Also fixes a
  pre-existing fragility: saved descriptions are now always composed via
  the shared `composeFeeDescription()` (never a raw user-typed override),
  so an edit can no longer accidentally strip the `"Fee: "` prefix that
  clear/undo/classification logic depends on. New `parseFeeDescription()`
  reconstructs type/note from existing rows' descriptions on load (falls
  back to type "other" + original text as note for anything that doesn't
  match the exact composed shape). ADR-091 addendum (docs/DECISIONS.md).
  Files: `src/lib/payments.ts` (`composeFeeDescription`,
  `parseFeeDescription`; `insertFeeLines` now calls the former instead of
  inlining the template), `src/routes/app.transactions.tsx`
  (`LinkedGroupDetail`). `tsc --noEmit` clean, 274/274 tests pass.
  Next: verify in a browser — open an existing payment-with-fees group
  (e.g. the Aaron's dresser debt), confirm lines load with sensible
  parsed type/note, edit and save, confirm clear/undo still pairs the fee
  rows with the payment correctly.

- **Found & diagnosed**: "Aarons - Dresser"'s 2026-09-28 payment split Tax
  ($5.06) out as its own Fee line — but Fee lines are excluded from
  `cycle_paid_to_date`/`remaining_balance` everywhere, so the cycle came up
  $5.06 short. Confirmed via the read-only MCP this is the only `"· tax"`
  fee line in the whole household (one-off, not systemic). **Still needs a
  manual fix by the user**, via the transactions screen's existing
  `LinkedGroupDetail` editor (no new tooling needed): open the 2026-09-28
  group (`split_group_id a9e15d26-103b-41ca-bee7-95edd5ba73c6`), change
  Amount from 92.04 → 97.10, delete the `tax` fee line, leave Non-Renewal
  Fee/Protection Plus alone, save. Expected after saving:
  `cycle_paid_to_date` 92.04 → 97.10, `remaining_balance` 1947.06 → 1942.00.
- Added "+ Itemize this amount" (ADR-046 addendum): lets Submit
  Payment/Log a Payment (debt and bill) build a single payment's amount from
  a labeled breakdown (e.g. Base $92.04 + Tax $5.06) that still counts
  toward the debt/bill as ONE payment — composes into that one transaction's
  own description instead of becoming separate, balance-excluded Fee rows.
  New shared `src/components/ItemizeAmountFields.tsx`; `src/lib/payments.ts`
  gains `ItemizedAmountLine`/`newItemizedAmountLine`/`itemizedAmountTotal`/
  `composeItemizedDescription`, plus an optional `description`/
  `principalDescription` override threaded through `PayInput`/
  `LogDebtPaymentInput`/`LogBillPaymentInput` into the one existing linked-row
  insert in `useMarkSubmitted`/`useMarkCleared`/`useLogDebtPayment`/
  `useLogBillPayment` (mirror-account legs untouched). No schema change, no
  new transaction rows — still exactly one linked payment per transaction,
  same as always.
  `tsc --noEmit` clean, 274/274 tests pass.
  Next: verify in a browser — on Log a Payment for Aarons - Dresser, use
  "+ Itemize," enter Base $92.04 + Tax $5.06, confirm Principal shows
  $97.10, save, confirm the description and cycle/balance movement via the
  MCP. Repeat on Submit Payment for parity.

- **User applied the Part 1 fix** (2026-09-28 Aarons - Dresser payment) via
  the app. Verified live via the read-only MCP: payment transaction now
  -$97.10, `tax` fee line gone, `remaining_balance` $1942.00 (was $1947.06),
  `payment_status` "cleared" (was "pending"), `cycle_paid_to_date` reset to
  $0.00 (correct — a resolved cycle resets this). Flagged one anomaly:
  `next_due_date` stayed at 2026-09-21 instead of rolling forward.
- **Diagnosed and fixed the `next_due_date` anomaly** (ADR-086 addendum):
  three debt-side RPCs (`apply_cleared_debt_payment`,
  `apply_debt_cycle_reset`, `apply_debt_mark_unpaid`) explicitly excluded
  monthly/one-time debts from ever advancing/reverting `next_due_date` —
  their bill equivalents have never had this exclusion and already roll
  forward correctly in production. Root cause confirmed by reading the live
  function bodies via the read-only MCP; cross-checked `rollback_cleared_debt_
  payment` (already correct) and `ledger-state.ts`'s monthly cycle-math
  (already written to tolerate an advancing `next_due_date` — the comment at
  `src/lib/ledger-state.ts:145-151` anticipates exactly this). No app code
  change needed — pure DB function fix.
  Migration run by the user (`scripts/migrations/2026-10-17-monthly-debt-
  next-due-date-rollforward.sql`), confirmed live via the read-only MCP —
  function bodies match exactly.
- **Audited "Our Household" for other stale due dates** (user asked after
  the fix landed): zero bills stale (expected — bills never had this bug);
  **12 monthly debts** stuck 9–89 days stale, all already fully resolved
  (cleared, nothing owed) — Car, Alpine Medical - Stephanie, North Star
  Radiology, Mom, Providence Alaska, OPA/OrthoAlaska, Yukon Eye, Ticket 1,
  Ticket 2, Aarons - Dresser, Mission Lane, Milestone. Wrote a one-time data
  cleanup (`scripts/migrations/2026-10-17-stale-monthly-debt-due-dates-
  cleanup.sql`, explicit id→date pairs, no runtime recomputation) setting
  each to the next upcoming occurrence of its own `due_day` — not a replay
  of exact missed cycles, which proved unreliable for two of these ("Ticket
  1" and "Mom" don't have a clean matching cleared-payment trail). **Not
  yet run** — pending the user executing it manually in the Supabase SQL
  Editor.
  Cleanup migration run by the user, confirmed live via the MCP — all 12
  rows match exactly, `payment_status`/`cycle_paid_to_date` untouched on
  every one. Household-wide re-audit afterward found zero remaining stale
  cleared monthly debts. Both ADR-086 addendum parts (RPC fix + data
  cleanup) are fully done.
