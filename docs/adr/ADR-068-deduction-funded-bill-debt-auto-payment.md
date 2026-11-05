## ADR-068: Deduction-Funded Bill/Debt Auto-Payment

Decision:
Add nullable `funding_deduction_id` to `bills` and `debts`, referencing
`income_source_deductions(id)`. A deduction can only be linked as a funding source if it
has a `destination_account_id` set — reporting-only deductions can't fund anything, since
there'd be no transaction to attach the payment to. On mark-paycheck-received (extends
ADR-055's flow), after posting each deduction's deposit transaction, any bill/debt where
`funding_deduction_id` matches and the **current cycle only** is `unpaid`/`pending` gets
marked paid and linked to that deposit transaction / `split_group_id`. No future-cycle
pre-pay — this only ever touches the cycle a bill/debt is currently sitting in, consistent
with `deriveCycleInfo()` and ADR-057's overdue-aware allocation.

If the bill's due amount doesn't match the deduction's amount/percent that cycle, mark it
paid anyway and log the mismatch — the deduction is authoritative, logging just gives
visibility without blocking the flow. If that cycle was already manually marked paid
before paycheck-received fires, no-op and log it — no double-posting.

Dashboard "Past Due" Deduction vs. HSA grouping reads `funding_deduction_id` →
`destination_account_id` → the linked account's institution/`include_in_net_worth`, so no
new flag is needed to distinguish HSA-funded from plain-payroll-deducted items — it's
derived from which account the linked deduction deposits into (real HSA account vs. the
existing `is_spendable = false` / `include_in_net_worth = false` "Payroll Deduction"
pseudo-account).

The "destination_account_id required to fund a bill/debt" rule is enforced at the
app layer (Lovable/Kiro), not as a DB constraint — Postgres CHECK constraints can't
reference another table, and a trigger was judged unnecessary overhead for a two-user
household app. A one-time SQL check against existing data is run before this ships to
confirm no bad state exists.

Migration: forward-only. No blanket backfill — Steven will supply a specific list of
existing bills/debts to backfill `funding_deduction_id` via manual SQL script.

Open/unresolved: where mismatch and no-op-override events get logged (new table vs.
existing audit mechanism) is not yet decided — do not implement logging until this is
resolved in a follow-up note.

Reason:
Reuses ADR-055's deposit/split_group_id pattern instead of inventing a second payment
mechanism. Keeping this to current-cycle-only avoids new lookahead logic that would
otherwise interact with ADR-060's ephemeral recurrence projection and risk double-crediting
if a deduction cadence doesn't match a bill's due cadence.

Schema:
```sql
alter table bills add column funding_deduction_id uuid references income_source_deductions(id);
alter table debts add column funding_deduction_id uuid references income_source_deductions(id);
```

Logging destination (resolved 2026-08-18): a dedicated `deduction_payment_events` table
(`bill_id`, `debt_id`, `deduction_id`, `event_type` in ('mismatch','already_paid_noop'),
`expected_amount`, `actual_amount`, `note`, `created_at`). See SCHEMA.md.

Implementation (2026-08-18):
- `src/lib/deduction-funding.ts` → `applyDeductionFundedPayments()` runs at the end of
  `useMarkIncomeReceived()` (`src/lib/income-hooks.ts`), after the ADR-055 deduction
  deposits are inserted (`.select("id")` so each deposit's id is known). It loads bills
  and debts whose `funding_deduction_id` matches a deduction that has a destination
  account, derives the current cycle with the existing `deriveCycleInfo()` (no new date
  logic), and for unpaid/pending/partial cycles calls `applyClearedPayment()` first
  (ADR-037 payable-first + `updateRow()` guard) before linking the deposit transaction
  via `linked_bill_id`/`linked_debt_id` and the pay event's `split_group_id`. Mismatched
  and already-cleared cases write `deduction_payment_events` rows.
- Write-path validation lives in the bill and debt dialogs (`app.bills.tsx`,
  `app.debts.tsx`): a "Funded by deduction" picker disables reporting-only deductions and
  the save is blocked with an inline error if one is somehow selected.
- Dashboard Past Due labels: `accounts` has no `include_in_net_worth` column in this
  project, so the HSA-vs-plain distinction is derived from the destination account's
  `account_type`/`name` (matches hsa/fsa → "HSA-funded", otherwise "Deduction-funded").

Status: Decided 2026-08-18. Implemented 2026-08-18.
## ADR-068: Deduction-Funded Bill/Debt Auto-Payment (continued)

Logging resolved: no existing generic audit/activity table (`information_schema` confirmed
empty on log/audit/activity naming), and `bill_adjustments`/`debt_adjustments` are scoped
to balance-affecting financial adjustments (ADR-058) — not a fit for mismatch/no-op
events, which never touch a balance. New dedicated table:

```sql
create table deduction_payment_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  bill_id uuid references bills(id),
  debt_id uuid references debts(id),
  deduction_id uuid not null references income_source_deductions(id),
  event_type text not null check (event_type in ('mismatch', 'already_paid_noop')),
  expected_amount numeric(12,2),
  actual_amount numeric(12,2),
  note text,
  created_at timestamptz not null default now()
);

alter table deduction_payment_events enable row level security;
create policy "household access" on deduction_payment_events for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

grant select, insert, update, delete on deduction_payment_events to authenticated;
grant all on deduction_payment_events to service_role;
```

Status: Decided 2026-08-18. Ready to implement — SQL above plus the earlier
`funding_deduction_id` columns on `bills`/`debts` can be run together in the SQL Editor as
one BEGIN...COMMIT block.

### Addendum 2026-08-27: sign convention for deduction-funded payments

Decision: In `deriveCycleInfo` (ADR-036), a payable with `funding_deduction_id`
counts its deduction's own deposit rows (positive amount, description starting
`Deduction:`) by magnitude instead of the usual `-amount` netting.

Reason: A deduction-funded repayment is written as the *deposit* into the
deduction's destination account (a TSP loan repayment is money INTO the TSP
account), so it is stored positive. Signed netting read it as a refund and both
TSP loans stayed UNPAID on Payment Schedule / Everything even though the account
was credited and `applyClearedPayment` had already reduced the balance and set
`payment_status = 'cleared'`. Other rows keep signed behaviour so a positive
`Reversed: …` row still cancels the payment it reverses.

Status: Decided 2026-08-27. Implemented (derivation only; no schema or data change).


