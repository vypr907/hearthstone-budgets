## ADR-101: Atomic Debt-Balance RPCs for Advance Draws and Adjustments

Decision:
Replace the client-side read-remaining_balance-then-write-absolute-value pattern in
`useCreateAdvance` and `useAddDebtAdjustment` (`src/lib/data-hooks.ts`) with two new
Postgres functions, `apply_debt_advance` and `apply_debt_adjustment` (both `security
invoker`, `scripts/migrations/2026-09-11-atomic-debt-balance-rpcs.sql`), that do the
entire debt-row update — `remaining_balance`, the `minimum_payment` mirror for
`debt_type='advance'`, ADR-066 reactivation, the payoff-date patch, and the
due-date-fill-if-blank — in one atomic `UPDATE` statement, so concurrent calls against
the same debt row always serialize correctly instead of overwriting each other.
`useLogDebtPayment`'s historical/out-of-cycle branch now also calls
`apply_debt_adjustment` with a negative amount (same shape as an adjustment).

Reason:
Two real incidents of silent balance corruption from this exact race — OnePay Advance
on 2026-08-24, and Dave ExtraCash on 2026-09-11 (2 advances + 2 fees entered 20-90
seconds apart; only one of each pair's effect survived, and the same race also stopped
the debt's cycle from resolving, so `next_due_date` never rolled forward). The existing
code only soft-warns about backdating (`confirmIfBackdated` in `app.debts.tsx`) but does
nothing about same-day/near-simultaneous entries, which is what actually happened both
times. Deliberately NOT covered: `applyClearedPayment`'s in-cycle branch (normal debt
payment logging — shortfall/cycle-satisfied/arrears/due-date-roll branching, a
materially bigger rewrite) and `useReversePayment` (one-off, user-invoked per specific
transaction, not a realistic race target).

Addendum (2026-09-11): end-to-end verification (a Playwright run against the TEST
household — two advances, a fee, then a payment, all through the real UI) immediately
reproduced a live instance of the uncovered gap above: `useLogDebtPayment`'s in-cycle
branch was still computing from the `debt` object the payment form had captured on open,
so a payment logged shortly after those advances silently paid down the *pre-advance*
balance instead of the current one ($40 instead of the correct $83). This is a normal
"draw, then pay" session, not a rare double-click — worth closing now rather than
deferring with the rest of the in-cycle rewrite. Fix: `useLogDebtPayment`
(`src/lib/payments.ts`) now re-fetches the debt row immediately before calling
`applyClearedPayment`, shrinking the staleness window from "however long the page had
been open" to one round trip. Not a full fix — `applyClearedPayment` itself is still not
atomic, so two payments fired within that same round trip could still race — tracked as
GitHub Issue #66 along with the rest of the deferred `applyClearedPayment` rewrite.
Re-ran the same Playwright verification after the addendum: balance, mirrors, and
`debt_adjustments.mirror_transaction_id` all correct.

Addendum (2026-09-13, Issue #66): closed the remaining gap — `applyClearedPayment`'s
in-cycle branch (`src/lib/payments.ts:283-404`) is now atomic too. Two new Postgres
functions, `apply_cleared_debt_payment` and `apply_cleared_bill_payment` (both
`security invoker`, `scripts/migrations/2026-09-13-atomic-cleared-payment-rpcs.sql`),
port the full shortfall/cycle-satisfied/arrears-overflow/due-date-roll state machine
into one locked `UPDATE` per kind, plus a small pure helper, `shift_billing_date`, that
ports `shiftDate`/`advanceDate` (`src/lib/format.ts`) into SQL rather than pre-computing
the rolled date in JS and passing it in — the whole point is that the roll has to read
the row's *live, lock-protected* `next_due_date`, or two concurrent payments would still
race on whose stale due date the roll is computed from. The bill branch's
"exceeds what's owed" rejection (ADR-057/076) is now enforced atomically inside the RPC
too (a sentinel `RAISE EXCEPTION` that rolls back the `UPDATE`), not just as a client
pre-check. `applyClearedPayment`'s public signature and return shape are unchanged —
all 8 call sites (`useMarkCleared`, `useEditLinkedTransaction`, `useLogDebtPayment`,
`useLogBillPayment`, `AddTransactionFab.tsx`, `StrandedDebtRepair.tsx`,
`StrandedBillRepair.tsx`, `deduction-funding.ts`) needed no changes.

Scope boundaries carried forward deliberately, not silently dropped: `priorArrears`
stays a client-computed parameter (`priorCyclesArrears`, `src/lib/arrears.ts`) — a pure,
ledger-independent function of row state, and porting its multi-cycle walk to SQL is a
separate, materially bigger change than what actually caused the two incidents. Five
sibling functions in `payments.ts` (`useMarkUnpaid`, `useResetCycle`,
`useReversePayment`, `rollbackClearedPayment`, `useCorrectPayment`) do the same
"read Payable, branch, write" pattern against the same columns and are still
unconverted — tracked as Issue #67.

Verification: `scripts/smoke/.pw/verify-cleared-payment.mjs` (RPC calls directly, no UI
timing) against the TEST household — bill shortfall-then-satisfy, monthly debt resolve
(due date untouched, `payment_status='cleared'`), biweekly debt resolve (due date
advances exactly 14 days), `one_time` debt closeout, a bill payment exceeding its cap
(throws, row provably unchanged afterward), an arrears-overflow payment, and the actual
race — two concurrent RPC calls against the same debt row, asserting the final balance
reflects both payments (no lost update) and the cycle resolves exactly once. User applied
the migration; full run **34/34 checks pass**, TEST household confirmed clean afterward
(no orphaned rows).

Status: Decided 2026-09-11. Implemented 2026-09-13.

Addendum (2026-09-24, Issue #67): converted the 5 sibling functions named
above. Ten new Postgres functions (`security invoker`,
`scripts/migrations/2026-09-24-atomic-payment-undo-rpcs.sql`) — one per JS
function per entity type, matching how `apply_debt_advance`/
`apply_debt_adjustment`/`apply_cleared_debt_payment`/
`apply_cleared_bill_payment` were each kept separate rather than
consolidating shapes that only looked similar:

- `useMarkUnpaid` -> `apply_debt_mark_unpaid` / `apply_bill_mark_unpaid`
- `useResetCycle` -> `apply_debt_cycle_reset` / `apply_bill_cycle_reset`
- `useReversePayment` -> `apply_debt_payment_reversal` / `apply_bill_payment_reversal`
- `rollbackClearedPayment` -> `rollback_cleared_debt_payment` / `rollback_cleared_bill_payment`
- `useCorrectPayment` -> `correct_cleared_debt_payment` / `correct_cleared_bill_payment`

The issue's own column list mixed debt-only (`arrears_paid_to_date`,
`minimum_payment`) and bill-only (`cycle_amount_due`) columns, so both
entity branches of all 5 functions were in scope, not just the debt side —
10 RPCs, not 5. Each is a direct single-`UPDATE` port of its JS function's
existing branch (every column reference in one `UPDATE`'s `SET` list sees
the same pre-update snapshot, so duplicating a condition across `SET`
clauses is safe, same style `apply_debt_advance` already used — not a CTE
chain like the cleared-payment RPCs, since none of these 5 need a
multi-step shortfall/overflow derivation). New shared helper
`rebuild_bill_cycle_amount_due` ports `rebuiltCycleAmountDue`
(`src/lib/payments.ts`) into SQL for the two bill RPCs that need it,
reusing `shift_billing_date` for its window math. `useCorrectPayment`'s
client-side resolve-boundary validation stays in JS as a fast pre-check
(unchanged messages); `correct_cleared_debt_payment`/
`correct_cleared_bill_payment` re-enforce the same three guards
server-side as the authoritative, race-closing check — the two guards with
no dynamic value raise the exact existing message text directly, the third
(carries a computed due amount) uses the same sentinel +
client-regex-translation pattern `apply_cleared_bill_payment`'s overpay cap
already established.

One genuine pre-existing asymmetry ported verbatim, not "fixed": unlike
the other 4 conversions, `useResetCycle`'s debt branch never mirrored
`minimum_payment` for advance debts — preserved exactly as-is rather than
silently changed while porting.

Status: Decided 2026-09-24. Implemented and verified 2026-09-24. Migration
applied by the user, verified via the read-only MCP (all 11 functions
present, `security invoker`). `src/lib/payments.ts` updated to call all 10
RPCs — `tsc --noEmit` clean, 246/246 tests pass.
`scripts/smoke/verify-payment-undo-rpcs.mjs` run against the TEST
household: **43/43 checks pass**, all 10 RPCs plus
`rebuild_bill_cycle_amount_due` exercised, household confirmed clean
afterward (no orphaned rows). Not yet checked in a running browser — sandbox
networking can't reach the dev server; needs a Codespace or real terminal
pass per CLAUDE.md.

