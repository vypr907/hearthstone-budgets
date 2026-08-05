## Session Notes

- Docs pass: SESSION.md content for 2026-08-04 summarized into CHANGELOG.md (4 entries),
  CONTEXT.md status/decisions/rules refreshed, SESSION.md reset.
- ADR-035 implemented: universal partial payments.
  - `payments.ts`: `debtCycleDue`/`debtRemainingOwed`/`payableRemainingOwed`, shared
    `applyClearedPayment()`, `ensureCycleAmount()`; submit always writes a new pending
    transaction (so a pending item can take another partial payment) and fixed bills get
    `cycle_amount_due` set automatically on the first submit of a cycle.
  - Debts now track `cycle_paid_to_date`; cycles resolve only at >= minimum_payment, and
    Undo reverses partial credits.
  - `pay-flow.tsx`: two-stage prompt — variable-bill "owed this cycle" (unchanged) then a
    universal "how much are you paying now?" defaulting to remaining owed.
  - "$X still owed this cycle" now shows on Bills list/detail, Debts list/detail and Everything.
  - Bill detail gained a Recent transactions section (last 10 by `linked_bill_id`).
  - Add Transaction gained an optional "Link to bill/debt" selector routed through
    `applyClearedPayment()`.
- ADR-036 implemented: ledger-derived 4-state payment cycle (supersedes ADR-010).
  - `ledger-state.ts`: pure `deriveCycleInfo()` + `useCycleState()` returning
    { state, due, clearedSum, remaining, transactions, pending, resolved };
    states are unpaid / pending / partial / cleared. A resolved cycle is detected by
    looking back one interval, since clearing advances the due date.
  - `payments.ts`: new `useResetCycle()` — deletes every transaction in the resolved
    cycle, zeroes cycle_paid_to_date, reverts payment_status and next_due_date
    (extends ADR-008 to multi-transaction cycles).
  - `pay-flow.tsx`: `tap(payable, info)` drives the machine — unpaid/partial prompt for
    an amount and create a pending tx, pending clears the latest pending tx on its own
    account (no re-prompt), cleared shows the "undo all payments this cycle?" confirm.
  - `PayActions` is now a single state-aware button used by Bills and Debts; Everything's
    tap icon uses the shared `stateVisual()` (unpaid neutral, pending yellow clock,
    partial orange, cleared green check) via new `--state-*` tokens in styles.css.
  - `src/lib/ledger-state.test.ts` covers the Rent 2 case ($609: 500 pending → partial
    $109 remaining → 109 pending → cleared/rolled → reset deletes both transactions).

Known issues: end-to-end verification in the live app wasn't possible (external Supabase,
no injectable session); logic is covered by the unit test above.

- Reported runtime error on Debt "Mark Cleared": PostgREST `Could not find the
  'cycle_paid_to_date' column of 'debts' in the schema cache`. Root cause: the ADR-035
  debts column was never applied to the live Supabase project (bills columns were).
  Fix is a DB migration the user runs in their own project:
  `alter table public.debts add column if not exists cycle_paid_to_date numeric not null default 0;`
  followed by `notify pgrst, 'reload schema';`. No app code change required — SCHEMA.md
  already documents the column (line ~334).

- Payment-write ordering hardening (follow-up to ADR-035/036): the debts
  `cycle_paid_to_date` failure left cleared/extra ledger rows with an untouched debt row
  (status stuck pending, remaining balance / paid-this-cycle / next due unchanged).
  - `payments.ts`: new `updateRow()` helper does bill/debt updates with `.select("id")`
    and throws when 0 rows change, so silent RLS/schema-cache failures surface.
  - Submit and Clear now update the bill/debt FIRST and write the ledger row second, so a
    failed payable write can no longer strand an orphan transaction.
  - `data-hooks.ts`: new `useDeleteLinkedTransaction()` (repair delete) removes a ledger
    row linked to a bill/debt without touching the payable.
  - Bill and Debt detail "Recent transactions" rows now show status and a trash button
    (confirm-gated) so stray rows from the failed write can be deleted.

Known issues: existing bad rows must be cleaned up manually via the new delete buttons;
the debt row itself may still need its payment status corrected by re-running the cycle.

- ADR-037 repair scan: `src/components/StrandedDebtRepair.tsx` (+ pure
  `findStrandedDebtPayments()`) shows an amber card on the Debts screen listing debts whose
  current cycle has cleared ledger rows while `cycle_paid_to_date` is 0 and the cycle never
  resolved. "Clean up" deletes those rows via `useDeleteLinkedTransaction()` so the payment
  can be redone through the normal flow.
- ADR-038 Set Aside: `src/components/SetAsideAction.tsx` on bill detail (only when a
  savings goal has `linked_bill_id` = the bill). Prompts source account + amount
  (default `monthlyEquivalent(bill)`), prompts for and saves `savings_goals.account_id`
  when unset, then writes two cleared transactions — the debit (no goal link) and the
  credit tagged `linked_goal_id`. No transfer table.
- ADR-039 goal allocations: `PayPeriodAllocation.goal_id` added; `useSetAllocation()` now
  accepts `categoryId` OR `goalId` and throws when both/neither are given; Paycheck Budget
  gained a "Savings goals" allocation block using the same slider/input UI, and the
  Allocated / Left-to-allocate math includes goal rows.

Known issues: the repair scan is heuristic (cleared rows + zero cycle credit + unresolved
cycle); it can't see rows the ledger never received. Set Aside has no guard against two
set-asides in the same month (open item in ADR-038).
