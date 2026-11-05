## ADR-058: Balance-Affecting Toggle on Adjustments; Bills Gain Their Own Adjustments Table

Decision:
Add `debt_adjustments.affects_balance boolean not null default true` (existing rows
keep today's behavior). Add a new `bill_adjustments` table mirroring
`debt_adjustments`' shape (bills and debts are already separate tables per the
existing schema, so this mirrors that split rather than unifying them). When
`affects_balance = false`, an adjustment is recorded for history but does NOT change
`remaining_balance` (debts) or `cycle_amount_due`/arrears (bills) — informational only
(e.g. "processing fee, paid in cash, doesn't change what's owed").

This is distinct from ADR-046's payment-fee transaction, which already never touches
the cycle — that mechanism is unchanged. This toggle only affects the
adjustments-table entries (insurance coverage, late fees, etc. added to what's owed).

Schema:
```sql
create table bill_adjustments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  bill_id uuid not null references bills(id) on delete cascade,
  amount numeric(12,2) not null,
  affects_balance boolean not null default true,
  adjustment_type text,
  description text,
  adjustment_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table bill_adjustments enable row level security;
create policy "household access" on bill_adjustments for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

grant select, insert, update, delete on bill_adjustments to authenticated;
grant all on bill_adjustments to service_role;

alter table debt_adjustments add column if not exists affects_balance boolean not null default true;
```

Status: Decided 2026-08-11. SQL run and verified (affects_balance confirmed present).

**2026-08-26 addendum — bill adjustments survive a cycle reset:**
`useResetCycle` and `useMarkUnpaid` (`src/lib/payments.ts`) previously wrote
`cycle_amount_due: null` unconditionally when undoing a fixed bill's cycle, with
no awareness of an active `bill_adjustments` row — silently dropping that
adjustment's effect on what's owed (this is the mechanism behind the Beiers
"Credit now" bug).

Decision: on reset/undo, rebuild `cycle_amount_due` instead of blanking it, via
the pure `rebuiltCycleAmountDue(bill, adjustments, dueDate)`. It returns
`bill.amount` + the sum of `affects_balance` adjustments whose `adjustment_date`
falls in the restored current cycle — a one-interval band around the due date
(`> shiftDateSafe(due, cycle, -1)`, `<= shiftDateSafe(due, cycle, +1)`), matching
`deriveCycleInfo`'s half-open window. Returns `null` (→ same as the old
behavior) when there is no such adjustment, for a variable bill (its
`cycle_amount_due` is a user-entered figure, not derivable from `amount`), or
when the `bill_adjustments` read fails (degrade, never block the undo). For the
"resolved" reset case the band is anchored on the *reversed* due date, since
that's the cycle the bill is being returned to. No schema change.

Status: Decided 2026-08-26. Implemented 2026-08-26 (`rebuiltCycleAmountDue` +
`fetchBillAdjustments` in payments.ts, wired into both reset paths; 12 unit
tests in `payments.test.ts`).

**2026-09-14 addendum — "Set amount owed this cycle" (variable bills):**
Diagnosed a real case: a variable bill's "Amount owed this cycle" prompt
(`ensureCycleAmount`, only ever asked the first time a payment is submitted
in a cycle) got answered with a stale figure, locking `cycle_amount_due` to
the wrong number for the whole cycle — with no way to notice or correct it
before paying, and no clean way to fix it after except misusing the
Adjustments panel (a delta against a real-world event, not a raw-number
correction) or deleting/redoing real transactions via "Reset this cycle."

Decision: `useSetBillCycleAmountDue()` (`src/lib/payments.ts`) writes
`bills.cycle_amount_due` directly — a plain overwrite, works whether it's
currently null or already set, touches nothing else (`cycle_paid_to_date`,
transactions, `bill_adjustments`). Exposed only for
`is_variable_amount` bills via a new `SetCycleAmountDueAction`
(`src/components/SetCycleAmountDueAction.tsx`), rendered on the bill detail
next to "Log a payment to this bill" (`app.bills.tsx`, current-cycle view
only). Lets a known upcoming amount (e.g. a statement that posts before the
due date) be set ahead of paying, and doubles as the correction tool for a
cycle that already has the wrong figure — without a synthetic adjustment
entry or touching real ledger rows.

Reason: `bill_adjustments` (this ADR) is for real-world events with their
own description/date/trail; using it to patch a stale internal number is a
misuse that leaves a confusing entry with no real-world referent. This gives
the raw number its own direct, purpose-built control instead.

Status: Decided 2026-09-14. Implemented. Verified end-to-end against the
TEST household: toggled a fixture bill variable, set its cycle amount via
the new dialog, confirmed `cycle_amount_due` updated with no transaction or
adjustment rows written, and that "Due this cycle" / "Still owed this
cycle" / the Submit-payment amount all picked it up immediately.

