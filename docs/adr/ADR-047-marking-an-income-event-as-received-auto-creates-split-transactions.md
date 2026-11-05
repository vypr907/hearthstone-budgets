## ADR-047: Marking an Income Event as Received Auto-Creates Split Transactions
(Extends ADR-024)

Decision:
income_events gains an explicit "mark as received" action (sets a real actual_date/
actual_amount if not already present — these columns already exist per ADR-024).
When a PRIMARY income_event with an income_source that has income_source_splits
rows is marked received, the app auto-creates one cleared transactions row per split:

- Fixed-amount splits: amount = the split's stored amount, account_id = the split's
  account_id, transaction_date = income_event's actual_date + that split's
  day_offset, description "Paycheck: <source name> → <account name>", no
  category_id, no linked_bill_id/debt/goal.
- The one remainder split: amount = actual_amount minus the sum of all fixed split
  amounts (not the typical/expected amount — so a paycheck that came in higher or
  lower than usual is absorbed entirely by the remainder account, matching how the
  real deposit actually splits).

If the income_event's source has NO income_source_splits rows (secondary income, or
a primary source never configured with splits), marking received creates exactly one
transaction for the full actual_amount, prompting the user to pick an account —
same as today's unsplit behavior, unchanged.

This is additive only: it does not require the income_source_splits editing UI
(still open per ADR-024) — it consumes whatever split rows already exist, however
they got there (direct SQL entry today, a future edit UI later, no different).

Reason:
ADR-024 built the split *template* (income_source_splits) and consumed it read-only
for display ("Read-only deposit splits shown when income_source_splits rows exist"),
but never wired splits into any actual money movement — receiving a paycheck still
required manually entering N transactions by hand, which is exactly the tedium the
splits table was meant to eliminate. Remainder-absorbs-variance keeps the model
consistent with how a real paycheck deposit works: fixed transfers are fixed, and
whatever's left (more or less than typical) lands in the primary account.

No new obligation/allocation logic changes: pay_period_allocations, obligationsInRange(),
and the Paycheck Budget period math (ADR-024/039) are unaffected — this only affects
what happens the moment an event is marked received, not how the resulting period is
budgeted.

Schema change:
None. Reuses income_events.actual_date/actual_amount and income_source_splits
(account_id, amount, day_offset) as already defined in ADR-024.

Migration steps:
1. Add a "Mark as received" action on income_events (Income tab / event list),
   prompting for actual_date (default today) and actual_amount (default the
   source's typical amount) if not already set on that event.
2. On confirm, look up income_source_splits for that event's income_source_id.
   If none exist, prompt for one account and create a single transaction for the
   full actual_amount (today's behavior, unchanged).
3. If splits exist, create one transaction per fixed split (day_offset applied to
   actual_date) plus one transaction for the remainder split, computed as
   actual_amount − sum(fixed split amounts). Guard: if the remainder would be
   negative (actual_amount came in lower than the fixed splits alone require),
   surface it as a warning and let the user adjust the remainder amount manually
   before confirming — don't silently write a negative-looking deposit.
4. All created transactions are status='cleared', no category_id, no linked_bill_id/
   linked_debt_id/linked_goal_id.

Status: Decided 2026-08-10. Implemented 2026-08-11, with one deviation:
- Created deposit rows share `split_group_id = income_event.id`, which both groups
  them in the ledger UI (ADR-044) and makes "mark received" idempotent.
- Follow-up (2026-08-11): the no-splits / no-usable-splits case now prompts for an
  account + amount via a dialog on the Paycheck screen. `useMarkIncomeReceived`
  accepts an optional `accountId`; when no split row resolves to a deposit, it
  writes a single deposit into the chosen account. If no account is provided it
  throws a clear error instead of silently marking the event received.

**2026-08-27 addendum — paycheck deposit groups are edited per-row, not as an
ADR-044 split.** The `split_group_id = income_event.id` deviation makes a
paycheck's deposits (bank splits + ADR-055 deduction deposits) look like an
ADR-044 category split to the transactions UI. They are not: they span
accounts, carry no `category_id`, and deduction-funded rows carry
`linked_bill_id`/`linked_debt_id` (ADR-068). Editing one through
`SplitTransactionDetail` ran `useSaveSplitTransaction`'s delete-all +
re-insert-onto-one-account path and collapsed the whole paycheck onto the
edited row's account (real incident: the 2026-08-27 "ASRC Federal" paycheck).

- `src/lib/split-groups.ts` `classifyLedgerGroup(rows, groupId, incomeEventIds)`
  → `category-split` only when the id is **not** an `income_events.id`, every
  row shares one `account_id`, and no row is bill/debt-linked; else `paycheck`
  or `linked-or-multi`.
- `TransactionDetail` (`src/routes/app.transactions.tsx`) routes to
  `SplitTransactionDetail` only for `category-split`. Anything else uses the
  normal single-row view + `useUpsertTransaction` — amount / account / date /
  status editable on a plain deposit; a deduction-funded (linked) deposit stays
  read-only and points at its bill/debt (existing `isLinked` handling). The
  category / place selects are hidden for a `split_group_id` row.
- `useSaveSplitTransaction` / `useDeleteSplitTransaction`
  (`src/lib/data-hooks.ts`) hard-refuse (via `assertCategorySplitRows`) any
  group that spans >1 account or contains a linked row — defense in depth.
- Ledger card label for a paycheck group: **"Paycheck · N deposits"**; its
  breakdown rows are individually clickable.
- The "mark received" idempotency check still keys on the existence of *any*
  `transactions` row with `split_group_id = event.id` — editing or deleting a
  subset of deposits will not trigger re-posting; delete every row to allow a
  clean re-run (a dedicated un-receive action is tracked separately).

Cross-ref: ADR-044 (category splits), ADR-055 / ADR-068 (deduction deposits).
No schema change.

**2026-09-10 addendum — a split may land BEFORE the pay date (negative
`day_offset`).** Real paychecks don't deposit every split on the same day: a
household's fixed transfers can arrive a day or two early while the remainder
lands on (or near) the official pay date. The recommended pattern is to anchor
`income_events.expected_date` / `actual_date` on the **official** pay date and
express each split's real arrival as a signed `day_offset` — negative for early,
positive for late. `income_source_splits.day_offset` is `integer NOT NULL default
0` and always allowed negatives; this only wires the rest of the stack to expect
them:

- `useMarkIncomeReceived` `shift()` (`src/lib/income-hooks.ts`) now delegates to
  the new `addDaysISO(date, days)` in `src/lib/format.ts`, which parses/re-formats
  from local date components (the house pattern, cf. `shiftDate`). The old inline
  `new Date(\`${date}T00:00:00\`)` + `setDate()` + `toISOString().slice(0,10)`
  could drift a day across a timezone boundary once the offset was non-zero
  (harmless while every offset was 0).
- Every auto-created deposit **and** deduction row now sets `cleared_date` per
  ADR-100 — split/remainder rows to their own shifted posting date, fallback and
  deduction rows to the base pay date. Before this, `useMarkIncomeReceived` was
  the one `status:'cleared'` writer that never set `cleared_date`; the first
  paycheck received after ADR-100 shipped (2026-09-10) left 7 rows with a null
  `cleared_date`. Balances / net worth tolerate it via `?? transaction_date`;
  those 7 pre-existing rows are not backfilled by this change.
- Split editor (`src/routes/app.income-source.$id.tsx` `SplitDialog`): field
  relabelled "Days relative to pay date", helper text for negatives, writes
  `day_offset: 0` (not `null`) when blank. Row summaries and the Paycheck
  screen's read-only splits card now read "Nd early" / "Nd late".

Known limitation (also in docs/TODO.md): an early split's `transaction_date`
falls in the previous pay-period / calendar-month window. Pay-period income is
summed from `income_events.actual_amount`, not deposit rows, so budgets are
unaffected — but any `transaction_date`-bucketed view shows the early deposit one
bucket back. Inherent to the offset model. No schema change.

