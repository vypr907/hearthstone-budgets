# Features I want
- [ ] [high] per-paycheck budgeting
- [ ] [med] future budgeting
- [ ] [med] bill calendar (sync with Google calendar)
- [ ] [low] tracking for side income, like UberEats driving
- [ ] [high] be able to handle partial payments and payment reversals
- [ ] [med] bill/debt that is pending should not show 'Submitted' button
- [ ] [low] simple AI chatbot to help answer questions, generate summaries, guide user around the app, etc
- [ ] [low] sync with banks like Rocket or Tilt
- [ ] [high] ability to add fees/extras
- [ ] [high] generate 1 page reports
- [ ] [low] colour themes customization

# Views
- [x] bill detail
- [ ] institutions - category icons / capitalization / group by / linked bills/debts
- [ ] account detail
- [ ] 

- 






# Next Lovable prompt
Continuing from the previous session — check TODO.md and SESSION.md for exactly what's
already implemented (items 1, 2, 3, 6, 8, 9 plus the ADR-033 monthlyEquivalent() helper
and bill envelope auto-creation are done and typechecking clean). Inspect the current
implementation of those before touching anything, then pick up the remaining pending work:

1. DASHBOARD REWORK (ADR-034)
Rebuild the Dashboard hero card around combined spendable balance as the primary number
(existing spendableContribution() logic, unchanged). Fold the separate "monthly
obligations" card into the hero: spendable balance, total set aside for bills this
period, total set aside for debts this period — excluding is_paycheck_deduction debts
(already implemented, reuse that exclusion). Add a new Dashboard card listing bills/debts
still owed this pay period, grouped by category with icon/color. Move the Net Worth Trend
chart to the very bottom of the Dashboard, after all other cards.

2. SPENDING/BUDGET SPLIT (ADR-034, uses the already-implemented monthlyEquivalent() helper)
On the Spending screen and Dashboard budget-vs-actual view, for each category sum the
monthlyEquivalent() of any bills where bills.category_id matches, and show
"Budgeted: $X spending + $Y bills = $Z" as two line items under one subtotal — never
merge into a single opaque number. Apply the same split to "Spent this month" (manual/
ledger spending vs. bill payments already made this cycle).

3. BILL "ADD TO ENVELOPE" ACTION (ADR-033)
On the bill card/detail for a bill with an existing linked envelope goal (linked_bill_id
already set from last session's auto-creation), add an "Add to envelope" button that
opens the existing quick-transaction form pre-filled with linked_goal_id set and
status='cleared'. Keep this fully separate from the bill's own pay/clear action so
setting money aside never looks like the bill was paid.

4. STATUS SNAPSHOT ADDITIONS
Add a "Balances" section to the Status Snapshot showing per-account-type subtotals
(checking, savings, credit, investment, retirement) via the existing balances.ts formula,
plus the combined spendable total. Add a progress bar for the current pay period (or
month if no active income event): amount paid so far vs. amount still owed in range. Add
a rule-based text summary — a new buildSnapshotSummary() function in src/lib/snapshot.ts,
plain string templates, no external API call — covering: obligations vs. available
spendable, any overdue item, and any comfortable surplus. Isolate it in its own function
so it can be swapped for an LLM-generated version later without touching the rest of the
snapshot.

Work through these in order; stop and report back after each one typechecks cleanly
rather than batching all four into one shot.



# Next Steps
## ADR-035 Draft
```
## ADR-035: Universal Bill Partial-Payment Support, Debt Cycle Tracking, and Linked Manual Transactions

Decision:

**Bills:** The "how much are you paying now?" prompt at Submit time (previously gated by
`is_variable_amount` per ADR-018) now fires for every bill, fixed or variable. This prompt
is separate from — and independent of — the existing `is_variable_amount` prompt that asks
"what's actually owed this cycle" (unchanged; still only asked for variable bills, still
populates `cycle_amount_due`). For fixed bills, `cycle_amount_due` is silently set to
`bills.amount` on first submit of a cycle instead of being left null. The payment-amount
prompt defaults to the remaining owed (`cycle_amount_due - cycle_paid_to_date`) but is
editable, enabling a genuine partial payment on any bill. Submit remains available any time
remaining-this-cycle > 0 — not gated on the bill's current `payment_status` — so a second,
third, etc. partial submission is always reachable, fixing the case where a pending bill's
Submit action became a no-op.

**Debts:** Add `debts.cycle_paid_to_date numeric(12,2) not null default 0`, mirroring bills.
`minimum_payment` is this cycle's due amount (no separate `cycle_amount_due` column needed —
debts don't have a variable-typical-vs-actual distinction). Clearing a debt transaction adds
its amount to `cycle_paid_to_date` and reduces `remaining_balance` by the real amount paid
(ADR-019's existing debt rule, unchanged). The cycle only resolves (due date advances,
`payment_status` resets, `cycle_paid_to_date` resets to 0) once `cycle_paid_to_date >=
minimum_payment`. A shortfall keeps the debt `pending`, open for a follow-up payment, same
shape as bills. Overpayment beyond `minimum_payment` still reduces `remaining_balance` as
extra principal and resolves the cycle immediately.

**Manual transaction entry:** The quick Add Transaction form gains an optional "Link to
bill/debt" selector (mutually exclusive `linked_bill_id` / `linked_debt_id`, reusing existing
columns — no new schema). When set, saving the transaction runs through the same cycle
update logic as the Submit/Clear payment flow (increments `cycle_paid_to_date`, resolves or
keeps-pending the cycle accordingly) rather than being saved as an orphan transaction with no
effect on the bill/debt's cycle state.

**UI:** Bills and debts both show a "$X still owed this cycle" indicator whenever remaining >
0 (previously bill-only, and only for variable bills). Bill detail view gains a "Recent
Transactions" section (last 10, newest first, `linked_bill_id` match) — parity with the debt
detail view built previously.

Reason:
Partial-payment tracking existed only for variable-amount bills, so fixed bills had no way
to record a real-world partial payment, and once a fixed bill hit `pending` there was no
next action defined — explaining the stuck Submit button. Debts had no per-cycle tracking at
all. Manual transaction entry never linked back to a bill/debt, so there was no way to log a
partial payment except through a flow that assumed full payment. Separating "what's owed"
from "what I'm paying right now" fixes all of these with one consistent model instead of
bill-only special-casing.

Status: Decided 2026-08-04. Not yet implemented.
```

## SQL for Migration:

```
-- ADR-035: Debt cycle tracking
alter table debts
  add column cycle_paid_to_date numeric(12,2) not null default 0;

-- ADR-035: Backfill existing fixed bills so the new universal logic doesn't hit nulls
update bills set cycle_amount_due = amount where cycle_amount_due is null;
update bills set cycle_paid_to_date = 0 where cycle_paid_to_date is null;
```


## Lovable Prompt:
Fixing partial-payment support across Bills, Debts, and manual transaction entry, per
ADR-035 in DECISIONS.md (already pasted/pushed). Schema for this batch
(debts.cycle_paid_to_date; bills.cycle_amount_due/cycle_paid_to_date backfilled) is already
applied in Supabase. Inspect the current bill/debt payment flow (src/lib/payments.ts) before
writing code — this changes existing submit/clear logic, not just adds new fields.

1. BILLS — universal partial payment
Remove the is_variable_amount gate on the "amount to submit now" prompt — every bill submit
(fixed or variable) now prompts for a payment amount, defaulting to remaining owed
(cycle_amount_due - cycle_paid_to_date), editable down for a partial payment. Keep the
existing is_variable_amount prompt for "what's actually owed this cycle" unchanged — that
still only fires for variable bills and still sets cycle_amount_due. For fixed bills,
cycle_amount_due is set to bills.amount automatically on first submit of a cycle if not
already set (no prompt). Submit stays available any time remaining-this-cycle > 0,
regardless of the bill's current payment_status — fix the case where a pending bill's
Submit button became a no-op once already pending; it should let the user submit another
partial payment toward the same cycle.

2. DEBTS — cycle tracking (mirrors bills)
Clearing a debt payment adds the transaction amount to debts.cycle_paid_to_date (new
column) and reduces remaining_balance by the real amount paid (existing rule, unchanged).
The cycle resolves (advance due date, reset payment_status to unpaid, reset
cycle_paid_to_date to 0) only once cycle_paid_to_date >= minimum_payment; a shortfall keeps
payment_status pending and Submit available for a follow-up payment, same UX pattern as
bills. Add a "$X still owed this cycle" indicator to Debts list/detail whenever
minimum_payment - cycle_paid_to_date > 0.

3. BILLS — same remaining-owed indicator
Show "$X still owed this cycle" on Bills list/detail and the Everything screen for any bill
with cycle_amount_due - cycle_paid_to_date > 0 (previously this only showed for variable
bills — now universal, reusing the same display already built for those).

4. BILL DETAIL — Recent Transactions section
Add a "Recent Transactions" section to the bill detail view: last 10 transactions where
linked_bill_id = this bill, newest first — same pattern as the existing debt detail
Recent Transactions section.

5. MANUAL TRANSACTION ENTRY — link to bill/debt
Add an optional "Link to bill/debt" selector to the quick Add Transaction form (mutually
exclusive: pick a bill OR a debt OR neither). When set, saving the transaction must route
through the same cycle-update logic as the Submit/Clear payment flow — incrementing
cycle_paid_to_date and resolving or keeping-pending the cycle exactly as a normal payment
would — rather than saving as a plain unlinked transaction with no effect on the bill/debt.

Work through these in order and report back after each typechecks cleanly.

## Every 4 weeks billing cycle
Short answer: not strictly, if you're willing to use `custom` — but `custom` currently has no automatic date-advance or monthly-equivalent logic (that's the open question flagged in ADR-033), so in practice you'd be hand-editing `next_due_date` every 4 weeks and the bill wouldn't show up correctly in monthly obligations. For a clean, self-advancing experience, yes — add a real cycle value.

**Recommended: add `every_4_weeks` as its own enum value**, same pattern as `biweekly` (which is already "every 2 weeks," not a monthly-family cycle):

```sql
alter table bills drop constraint bills_billing_cycle_check;
alter table bills add constraint bills_billing_cycle_check
  check (billing_cycle in ('monthly','biweekly','every_4_weeks','quarterly','bimonthly','annually','custom'));

alter table debts drop constraint debts_billing_cycle_check;
alter table debts add constraint debts_billing_cycle_check
  check (billing_cycle in ('monthly','biweekly','every_4_weeks','quarterly','bimonthly','annually','custom'));
```

Lovable prompt:
```
Add "every_4_weeks" as a valid billing_cycle value for bills and debts (schema constraint
already updated in Supabase). In advanceDate()/reverseDate() (shared bill/debt cycle-advance
helpers), every_4_weeks advances/reverses next_due_date by 28 days, same pattern as biweekly's
14 days. In monthlyEquivalent() (src/lib/format.ts, from ADR-033), every_4_weeks =
amount * 13 / 12 (13 payments/year ÷ 12 months) — same logic used for biweekly's ×2
approximation, just with the correct divisor for a 4-week cadence. Add "Every 4 Weeks" as a
title-cased option in the Billing Cycle dropdown on both the bill and debt forms.
```

One alternative worth knowing about, if you expect more oddball cadences later (every 6 weeks, every 10 weeks, etc.): instead of adding a new enum value each time, add a `cycle_interval_days integer` column used only when `billing_cycle = 'custom'`, and generalize `advanceDate()`/`monthlyEquivalent()` to read it. That's the real fix for ADR-033's open question, but it's a bigger lift than this one subscription needs right now — happy to draft that ADR instead if you'd rather solve it generically.