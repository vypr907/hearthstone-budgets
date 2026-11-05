## ADR-102: Debts Can Link to a Real Account (Mirrored Ledger)

Decision:
Add `debts.linked_account_id` (nullable uuid, no FK — this table has none today) and
`debt_adjustments.mirror_transaction_id` (same). When a debt has a `linked_account_id`
set, every balance-changing flow now also writes a mirror transaction onto that account,
in addition to its existing ledger effect — never carrying `linked_debt_id` on the mirror
leg, so it stays invisible to `deriveCycleInfo`'s cycle-progress math (that's what the
existing linked-and-counted rows are for):
- **Advance draws** (`useCreateAdvance`): the existing deposit leg (positive, into the
  chosen destination account) gets a sibling — negative, on `linked_account_id`, same
  `transfer_group_id`. `useDeleteAdvance` already deletes by `transfer_group_id`, so it
  needed no change to clean up both legs.
- **Adjustments/fees** (`useAddDebtAdjustment`): a new mirror transaction (sign flipped
  from the adjustment amount) on `linked_account_id`; its id is stored on the
  `debt_adjustments` row (`mirror_transaction_id`) so `useDeleteDebtAdjustment` can clean
  it up too.
- **Repayments** (`useLogDebtPayment`): the existing "Debt payment" transaction gets a
  `transfer_group_id` (new — it previously only had `split_group_id`, for fee-pairing;
  the two coexist without conflict) paired with a positive credit mirror on
  `linked_account_id`.

`null` for every debt with no backing account (e.g. OnePay Advance, which has none) —
those are completely unaffected. First (only, so far) debt to get one: Dave ExtraCash,
linked to its own real "Dave ExtraCash" credit account
(`scripts/migrations/2026-09-11-debt-linked-account.sql`).

Reason:
The user found that "Dave ExtraCash" existed as both a `debts` row (drives the payment
UI, cycles, due dates) and an `accounts` row (a real credit line with its own balance)
that were only connected by matching names — the account never received a single
transaction, so it couldn't be used to verify anything against a real Dave statement.
General column rather than a Dave-specific hack, since any future debt with a real
backing account (any advance/credit-line product with its own "account" entry) hits the
same gap.

Not covered: reversing/repair-deleting a mirrored repayment doesn't yet clean up its
mirror leg — `useReversePayment` and `useDeleteLinkedTransaction` are generic and don't
know about `transfer_group_id` pairing the way `useDeleteAdvance` already does. Tracked
as GitHub Issue #65. Also not covered: no UI picker to set `linked_account_id` on a debt
yet — set via migration for now, same as Dave.

**2026-09-15 addendum — extended to credit-card debts; derived balance;
closed Issue #65:** the user wanted their credit-type `accounts` (Milestone,
CreditOne, Mission Lane) connected to their matching `debts` rows, which had
been tracked completely independently (the account had zero-to-few
transactions; the debt's balance moved only via Advance/Adjustment/Payment,
since there's no "purchase" concept anywhere in the app). Decision: once
linked, **the account becomes the source of truth** — a purchase is logged
as a normal expense transaction on the account (already fully supported,
zero new code), and the debt's `remaining_balance` is *derived* from the
account's balance, never independently written. Same "derived, never
stored" shape this app already uses for savings-goal balances (ADR-027) and
ledger cycle state (ADR-036/085), rather than keeping a stored column in
sync via write-time hooks scattered across every account-mutating code
path — this app has been bitten by exactly that class of bug twice this
session already (Dave ExtraCash, EarnIn, both pre-atomic-RPC balance races).

- `src/lib/balances.ts` — `effectiveDebtBalance(debt, accounts, latest,
  transactions)`: `creditOwed(computeBalances(...).current)` for a linked
  debt, else falls back to the stored `remaining_balance` unchanged — every
  unlinked debt (the vast majority) is byte-for-byte unaffected.
- `src/lib/data-hooks.ts` — new `useEffectiveDebts()` hydrates every linked
  debt's `remaining_balance` with the derived value. **Display-path only**:
  swapped in at every screen that only reads the balance (`app.index.tsx`,
  `app.institutions.tsx`, `app.payment-schedule.tsx`, `app.snapshot.tsx`,
  `app.debt-strategy.tsx`, `app.paycheck.tsx`, `app.pending.tsx`). Screens
  that also trigger a mutation (`app.debts.tsx`, `app.everything.tsx`) keep
  the **raw** `useDebts()` feeding every `toPayable()`/mutation call, since
  several mutations (`useMarkUnpaid`, `useResetCycle`, `useReversePayment`,
  `useCorrectPayment`, Issue #67) still compute
  `next = debt.remaining_balance ± amount` client-side and write it back
  absolute — a derived number there would corrupt the now-inert stored
  column. Those two screens compute a small local display-only value
  instead (`DebtsPage`'s `effectiveBalanceById` map; `DebtDetailDialog`'s own
  internal `effectiveDebtBalance` call) everywhere they show a dollar
  figure, leaving the `Debt` object itself untouched.
- `DebtDialog` (edit form): once linked, "Remaining balance" is shown
  read-only (the derived value) and omitted from the save payload — same
  treatment `isAdvance` already gets, just a different owner. `minimum_payment`
  is **not** derived — a real credit card's minimum payment is a smaller
  required amount, not the full balance (`advanceMinimumPaymentPatch` was
  already, and remains, gated to `debt_type === "advance"` only). The
  Adjustments/Advances "Add" actions are hidden once linked (they'd
  otherwise be a silent no-op against a balance nothing reads anymore; a
  credit card has no real "advance" concept either way).
- `src/lib/debt-history.ts` (Year in Review): `debtBalanceAsOf` delegates
  entirely to `net-worth.ts`'s `balanceAsOf` for a linked debt, for every
  date — accepted tradeoff, the trend for months before the account had
  real activity reads flat/inaccurate for these debts; the live balance
  shown everywhere else always uses `effectiveDebtBalance`, not this
  function.
- `StrandedDebtRepair.tsx` excludes any linked debt from its scan — its
  heuristic assumes `remaining_balance` is authoritative, no longer true
  once linked.
- **Closes Issue #65** for real: `useMarkSubmitted`/`useMarkCleared` (the
  everyday Submit/Clear tap-to-pay flow — previously *not* covered by this
  ADR at all, only the secondary "Log a payment" dialog was) now mirror
  onto the linked account too, sharing `transfer_group_id` on **both** rows
  (not just the mirror, matching how advances already did it) so a mirror
  can actually be found again later. `useMarkUnpaid`, `useResetCycle`,
  `useReversePayment`, and `useEditLinkedTransaction` all now find and
  clean up / reverse / keep in sync a payment's mirror leg via that shared
  id — the gap this ADR originally left open is closed for every payment
  path, not just the one `useLogDebtPayment` already handled correctly.
- Linked (via data migration, no UI change to the picker beyond what
  already existed): Milestone, CreditOne, Mission Lane — each anchored so
  the very first derived read after linking matches what was already
  trusted (no jump); the user's own statement reconciliation for these
  three supersedes those anchor numbers separately, later. GTC (a
  credit-card debt with no matching account) stays debt-only, untouched.

**2026-10-13 addendum — narrowed the hidden-Add-buttons clause to non-advance
linked debts:** the 2026-09-15 addendum's "Adjustments/Advances 'Add' actions
are hidden once linked" was written with credit-card debts in mind (Milestone,
CreditOne, Mission Lane — no real "advance" concept, so hiding was correct)
but the gate itself was unconditional on `linked_account_id` alone, so it also
hid the button for Dave ExtraCash (`debt_type = 'advance'`), the one other
debt linked so far. That was an overcorrection: `useCreateAdvance` and
`useAddDebtAdjustment` have been linked-account-aware since this ADR's
original 2026-09-11 version — both already write a correctly-signed mirror
transaction onto `linked_account_id`, so the button was hiding working,
already-correct code, not a real no-op. Decision: narrow the gate in
`src/routes/app.debts.tsx` (`DebtAdjustments`) to `linked_account_id &&
debt_type !== 'advance'` for both the Adjustments and Advances sections —
credit-card debts keep the original hidden behavior unchanged; a linked
advance debt now shows both "Record advance" and "Add adjustment," each
writing straight through to the linked account exactly as the unlinked case
already did. Also added `"advance_fee"` to `ADJUSTMENT_TYPES` so a fee can be
logged with an on-the-nose label instead of "Other." No hook/schema/RPC
change — purely a UI gate and copy fix. See ADR-111 for the related
per-advance history view added in the same pass.

**2026-10-14 addendum — extended "derived, never stored" to the WRITE
path for `minimum_payment`/`next_due_date`:** the 2026-10-13 addendum
restored "Record advance" for a linked advance debt, and the very first
real use of it (a $100 advance + $10 fee against Dave ExtraCash) exposed
a bug this ADR's original version never covered: `apply_debt_advance`/
`apply_debt_adjustment` (the atomic RPCs, ADR-101) always add onto
whatever `debts.remaining_balance` currently holds — correct for an
unlinked debt, where that column is the trusted balance, but once linked
the column is only ever corrected on the *read* path (`effectiveDebtBalance()`/
`useEffectiveDebts()`), never the write path. It had drifted to a stale
$30, and the new advance additively landed on top of it (30 + 100 + 10 =
140) instead of the real $0 + 100 + 10 = 110. `minimum_payment`/
`next_due_date` have no derived-override equivalent anywhere, so this
write-path mistake reached the UI directly — and a stale, already-passed
`next_due_date` then tripped a false "past due" in `arrears.ts`'s cycle
walk.

Decision: both RPCs gain one new optional trailing parameter,
`p_current_balance_override numeric default null` (`scripts/migrations/
2026-10-14-linked-advance-balance-override.sql`) — fully backward
compatible, every existing caller that never passes it is byte-for-byte
unchanged. `useCreateAdvance`/`useAddDebtAdjustment` (`src/lib/data-hooks.ts`)
now compute the real current balance via `effectiveDebtBalance()`
whenever `debt.linked_account_id` is set, and pass it in; the RPC uses
`coalesce(p_current_balance_override, remaining_balance)` as its
baseline instead of the bare column. `apply_debt_advance`'s due-date
logic widens from "fill once, only if blank" to also reset when the
(possibly-overridden) baseline is ~0 — i.e. the prior advance, if any,
was already settled — replacing a stale date instead of only filling a
null one. This also fixes the identical gap for an *unlinked* advance
debt that's fully paid off and gets a new draw (same stale-due-date
problem, just never reported yet) — a correct generalization of the same
rule, not a new behavior. A one-time data fix in the same migration
corrects Dave's already-drifted row directly (remaining_balance/
minimum_payment → $110.00, next_due_date → 2026-10-22), since it can't
retroactively re-run through the now-fixed RPC.

Kept out of scope: `useLogDebtPayment`'s historical/out-of-cycle branch
(`src/lib/payments.ts`) calls the same `apply_debt_adjustment` RPC with
the same staleness exposure for a linked debt, but fixing it the same
way would need importing `effectiveDebtBalance`'s account/balance/
transaction data into `payments.ts` — which `data-hooks.ts` already
imports *from*, so pulling those hooks in the other direction risks a
circular import. Flagged as a known related gap, not fixed here.

Status: Decided 2026-09-11. Implemented 2026-09-11; extended 2026-09-15;
addendum 2026-10-13; addendum 2026-10-14.

