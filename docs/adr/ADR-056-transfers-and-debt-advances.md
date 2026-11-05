## ADR-056: Transfers and Debt Advances

Decision:
Add `transactions.transfer_group_id uuid` (nullable, no FK — self-tagging group,
same pattern as `split_group_id`). A transfer writes two cleared transactions sharing
one `transfer_group_id`: negative amount on the from-account, positive amount on the
to-account, no category, no linked_bill/debt/goal.

An advance reuses ADR-045's `debt_adjustments` table rather than a new mechanism:
choosing a debt + destination account writes (a) one deposit transaction into the
destination account (cleared, `transfer_group_id` set, description "Advance: <debt
name>"), and (b) one `debt_adjustments` row with a positive `amount` (increases
`remaining_balance`) and `adjustment_type = 'advance'`. Deleting either side of a
transfer or advance deletes both rows sharing the group id (transfer) or the
transaction + its paired adjustment (advance).

Reason:
`split_group_id` already solved "tag several rows as one event" for splits — a
transfer is the same shape (two rows, one event), so reusing the pattern with its own
column avoids ambiguity between splits and transfers on the same transaction. The
advance is exactly what `debt_adjustments` (ADR-045) already models: a non-payment
balance change; no new table needed.

Schema:
```sql
alter table transactions add column if not exists transfer_group_id uuid;
```

Status: Decided 2026-08-11. SQL run — pending your individual verification of income_source_deductions/bill_adjustments table existence (see prior message's split-out checks).

**2026-08-19 addendum — advance minimum-payment invariant and pay-period-aware due date:**
For `debt_type = 'advance'` debts, `minimum_payment` always mirrors
`remaining_balance` — the whole draw is due next cycle, no manual entry.
`advanceMinimumPaymentPatch()` (`src/lib/payments.ts`) is merged into every
write that changes a debt's `remaining_balance` (`useCreateAdvance`,
`useDeleteAdvance`, `useAddDebtAdjustment`, `useDeleteDebtAdjustment`,
`applyClearedPayment`'s debt branch, `useReversePayment`'s debt branch), so
the invariant can't drift regardless of which action changed the balance.

Separately: a biweekly advance-type debt's `next_due_date` is a one-time
smart default from the household's next scheduled paycheck
(`nextPayDate()`, `src/lib/paycheck-budget.ts`, keyed off the primary income
source's events) — filled in on the Add/Edit Debt form when Type=Advance and
Cycle=Biweekly are both set and the field is still empty, and again as a
fallback when a new advance is recorded against a biweekly advance-type debt
with no due date yet. In both cases it only fills a blank field and is never
re-applied once the user has touched it or a due date already exists — no
ongoing resync, and every other billing cycle/debt type is unaffected.

Reason:
The original advance write path (this ADR) only ever touched
`remaining_balance` — taking an advance left minimum payment, still-owed-
this-cycle, and next due date all blank, since nothing else in the app
computed them. Advance products (MoneyLion Instacash, EarnIn, etc.) are due
in full next payday, so mirroring minimum_payment to the balance and
defaulting the due date to the next paycheck reflects that directly instead
of requiring manual upkeep. Scoped to `debt_type='advance'` only — every
other debt/bill type keeps its existing minimum_payment and due-date
behavior unchanged.

**2026-08-27 addendum — advance balance is form-read-only; the Add/Edit Debt
form never stamps an advance paid-off:**
For `debt_type = 'advance'`, the Add/Edit Debt form (`DebtDialog`,
`src/routes/app.debts.tsx`) shows **Remaining balance** and **Minimum payment**
as disabled fields and never writes them — a draw is recorded through "Record
advance" (`useCreateAdvance`), payments bring the balance down, and
`advanceMinimumPaymentPatch()` keeps minimum payment mirrored. The form also
never computes `date_paid_off` for an advance: payoff/reactivation is owned by
the payment flow + `advanceReactivationPatch()`. On **create** it seeds the two
NOT NULL columns at `remaining_balance = 0`, `minimum_payment = 0`; on **edit**
it omits `remaining_balance`, `minimum_payment` and `date_paid_off` from the
`UPDATE` payload entirely, so a stale debt snapshot (the detail dialog is opened
at $0, a draw is recorded from inside it, then Edit → Save) cannot clobber the
live balance.

Also: the Debts list's `isPaidOff(d)` now treats an advance as paid off only
when `date_paid_off` is actually set — an advance routinely sits at $0 between
draws and must stay in the active list. Every other debt type is still "paid
off" the moment `remaining_balance <= 0`.

Separately (all debt types): creating a brand-new debt with no starting balance
**and** no remaining balance no longer stamps `date_paid_off` — an empty new
row is an active shell, not a settled debt. Recording an already-paid historical
debt still works by giving it a starting balance > 0. And because
`debts.interest_rate` is NOT NULL (default 0) and `debts.minimum_payment` is
NOT NULL (no default), the form now writes `0` for a blank rate / minimum
payment instead of `null` — a `null` insert was silently rejected, so a debt
created without those fields never saved.

Reason:
A new advance is legitimately created at $0 (the product exists before the first
draw), but the form's `remaining_balance <= 0 → stamp date_paid_off` sync then
marked it paid-off and hid it from every aggregate (which key off
`date_paid_off` / `remaining_balance <= 0`). Worse, re-saving the form later —
while it still held a stale `0` — wiped a live draw recorded via "Record
advance" back to $0/paid-off (observed on the "Dave ExtraCash" debt: the $50
deposit and `debt_adjustments` advance row survived, but `debts.remaining_balance`
was reset). Making the advance balance untouchable from the form removes the
whole class of bug; the general empty-debt guard stops the same paid-off stamp
firing on a just-created shell of any type.

Data fix: existing advance rows corrupted this way (e.g. "Dave ExtraCash") are
repaired with a manual `UPDATE` setting `remaining_balance` /`minimum_payment`
back to the sum of their outstanding `debt_adjustments` advances and clearing
`date_paid_off`.

Status: Decided 2026-08-27. Implemented (`src/routes/app.debts.tsx`).

**2026-09-14 addendum — advance creation inherits category/place from the
debt:** `useCreateAdvance`'s deposit transaction (and, when
`linked_account_id` is set, its mirror withdrawal leg) now carries
`category_id`/`institution_id` inherited from the advance debt's own
`category_id`/`institution_id` — the deposit leg gets both, the mirror leg
gets only `institution_id` (not `category_id`, to keep a transfer leg out of
spending-category reports). This mirrors how `useLogDebtPayment` already
populates the same fields on a repayment via `toPayable()`
(`src/lib/payments.ts`), so a draw and its repayment land in the same
category/place instead of only the repayment doing so. No schema change —
both columns already existed on `transactions`; the debt itself must have
`category_id`/`institution_id` set (via the existing debt edit form) for
either write path to have something to inherit.

Reason:
The deposit insert never referenced the debt's category/institution at all —
a plain gap, not a deliberate choice. Verified live (via the read-only
Supabase MCP): the "Advances" category and per-debt institutions already
existed and had been set by hand on individual transactions after the fact;
this closes the gap so new advances don't need that manual step.

Status: Decided 2026-09-14. Implemented (`src/lib/data-hooks.ts`).

---

