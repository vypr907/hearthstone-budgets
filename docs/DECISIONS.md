## ADR-001: Use Supabase Instead of Lovable Cloud

Decision:
Use a separately managed Supabase project.

Reason:
The schema must remain inspectable, portable, and directly controlled.

## ADR-002: Shared Household Accounts

Decision:
Two users share one household dataset.

Reason:
The application models household finances rather than independent personal budgets.

## ADR-003: Transaction Ledger Model

Decision:
Transactions are the financial source of truth.

Reason:
Bills, debts, and balances are events that affect accounts.

## ADR-004: Android Only

Decision:
Build Android through Capacitor.

Reason:
The project goal is a native Android distribution workflow.

## ADR-005: Institutions Support Multiple Categories

Decision:
Replace institutions.category_id (single FK) with a join table, institution_categories
(institution_id, category_id), enabling many-to-many institution-to-category relationships.

Reason:
A single institution can reasonably span more than one spending category (e.g. a retailer
that's both "Pets" and "Household"). A single category_id column couldn't express that.

Status: Implemented 2026-07-28.


## ADR-006: Bills and Debts Reference Institutions, Not Accounts

Decision:
bills.institution_id and debts.institution_id both reference institutions(id). Neither
table has an account_id column.

Reason:
A bill or debt is often owed to an institution with no balance-bearing account underneath
it (e.g. Petco, a medical provider, a subscription). Requiring account_id would force one
to always exist, which doesn't match reality. Which account actually pays a given cycle is
tracked per-payment via transactions.account_id (through linked_bill_id/linked_debt_id),
not as a static field on bills/debts.

Status: Confirmed 2026-07-28 (documentation previously stated the opposite in error).

## ADR-007: Account Selection at Payment Time

Decision:
When marking a bill or debt as pending/cleared, the paying account is resolved at that
moment, not stored on bills/debts. If the linked institution has exactly one account,
auto-select it. If it has multiple accounts, prompt the user to choose. If it has zero
accounts, block the action and prompt the user to add one first.

Reason:
transactions.account_id is NOT NULL, but bills/debts intentionally have no account_id
(ADR-006), since an institution may have zero, one, or many accounts. This resolves that
gap without reopening ADR-006.

Status: Implemented 2026-07-28.

## ADR-008: Undo Is a Full Reversal

Decision:
"Undo" on a cleared bill or debt deletes the associated transactions row, resets
payment_status to 'unpaid', and reverts next_due_date (bills) / remaining_balance (debts)
to their pre-clear values.

Reason:
Undo is meant for correcting an accidental click, not recording a real reversed payment.
Treating it as "that clear never happened" is simpler and matches user intent. A genuine
reversal of real money already moved (e.g. a bounced payment) should be handled as a new
correcting transaction instead, not via Undo.

Note: this narrows Phase 3.5's original "transactions are permanent, never deleted" rule —
that rule still applies to normal history; Undo is the one intentional exception, scoped
only to reversing a same-session mis-click.

Status: Implemented 2026-07-28.

## ADR-009: Everything Checkbox Is Ledger-Aware, Not Status-Aware

Decision:
On the Everything screen, a bill/debt's checkbox reflects whether a 'cleared' transaction
exists for its current billing cycle — not whether payment_status literally equals 'cleared'.

Reason:
Clearing a bill automatically rolls payment_status back to 'unpaid' for the new cycle
(Phase 3.5 design) and advances next_due_date. A checkbox bound directly to payment_status
would always uncheck itself the instant a bill clears, which is correct under the hood but
looks broken to the user. Defining "checked" as "a cleared transaction exists dated within
the bill's current cycle window" keeps the checkbox meaningful without changing the
underlying rollover behavior on Bills/Debts.

Status: Implemented 2026-07-28.

## ADR-010: Everything Checkbox Cycles Through Submit-Then-Clear

Decision:
On the Everything screen, tapping a bill/debt's checkbox cycles it through the same states
as Bills/Debts: unpaid → pending → cleared. It does not jump straight to 'cleared' in one tap.

Reason:
Consistency with Bills/Debts' submit-then-clear semantics (Phase 3.5) outweighs the extra
tap. A one-tap "cleared" shortcut risks the same mismatch that caused earlier bugs in this
area — Everything having its own shortcut logic instead of sharing one real flow.

Status: Implemented 2026-07-28.

## ADR-011: Parent Category Stays a Text Column (For Now)

Decision:
categories.parent_category remains a plain text column. No parent_categories table
or join table is introduced at this time.

Reason:
Considered normalizing parent_category into its own table (parent_categories) with
categories.parent_category_id as an FK, to eliminate naming-drift bugs (e.g. the
"Gifts/Holidays" vs "Gifts & Holidays" mismatch hit during Phase 4 import) and to
support future parent-level metadata (color, icon, display order) for charts.

For a 2-person household app, the drift risk is adequately handled by the existing
pre-insert validation query (compare sheet parent labels against seeded
parent_category values before import) and is not frequent enough to justify a
migration right now. Chart/analysis grouping by parent_category already works fine
as a plain text `group by` — a join table adds no query capability that doesn't
already exist, only integrity and future metadata support.

Revisit when: parent category renames become frequent, or the "sell this as a
product" path (see PLAN.md's Future Add-On section) becomes real — multi-household
FK integrity matters more once other households' data is involved.

See PARENT_CATEGORY_MIGRATION.md for the exact steps to take when this is revisited.

### Spending groups use categories.parent_category as plain text
categories.parent_category is a text label, not a FK. Grouping on the Spending screen keys off the trimmed text ("Ungrouped" when empty) rather than looking up another categories row.

Status: Decided 2026-07-30. Not implemented.

## ADR-012: Ledger-derived spending actuals with manual fallback
Decision: A category's actual for a month is the sum of its negative transactions that month when any exist; otherwise the manually entered spending_actuals row is used. Ledger-derived cells are not editable inline.
Reason: Avoids double-counting and avoids retyping monthly totals for categories already tracked as transactions, while keeping manual entry for categories that are never itemised.
Status: Decided 2026-08-02. Implemented.

## ADR-013: Spendable balance definition
Decision: Combined spendable = accounts with is_spendable = true AND account_type in ('checking','credit'). 'savings', 'investment' and 'retirement' are excluded unconditionally. Balance per account uses the shared formula in src/lib/balances.ts.
Reason: is_spendable is a user-set flag that can be wrong on long-term accounts; the type exclusion is a hard guard.
Status: Decided 2026-08-02. Implemented.

## ADR-014: Manual transaction sign convention
Decision: In the quick-add transaction dialog a positive amount is stored as a negative (money out); a negative amount is stored as-is (money in).
Reason: Most manual entries are spending, and it keeps the form to the four requested fields with no extra direction toggle.
Status: Decided 2026-08-02. Implemented.

## ADR-015: Debt payoff projection engine
Decision: Simulate payoff month-by-month in the client (src/lib/debt-payoff.ts) rather than storing projections; when a debt has known_finance_charge, use it verbatim as that debt's total interest instead of the simulated figure.
Reason: Projections change with every balance/payment edit, so caching them invites staleness. Real loan/lease paperwork is more accurate than amortization estimates for those specific debts.
Status: Decided 2026-07-30. Implemented.

## ADR-016: `known_finance_charge` Redefined as Remaining Interest (Factor-Rate Debts Only)

Decision:
`known_finance_charge` represents interest still owed from today forward under a debt's
real fixed payment schedule — not the original total interest calculated at loan
origination. It is populated only for factor-rate/fixed-schedule debts where standard
`interest_rate`-based amortization doesn't apply (confirmed pattern: early payments are
disproportionately principal, later payments disproportionately interest, in a way
standard compounding doesn't produce). Standard-rate loans, credit cards, and
no-interest/no-agreement debts leave it null and rely on `interest_rate`.

Reason:
The field was originally set once at origination (total life-of-loan interest), which
double-counted interest already paid. This caused the payoff simulation to either finish
too early (paying off principal before the real finance charge was satisfied) or overshoot
(double-counting interest already paid), depending on which figure was used. Verified
against a real debt's payment history and live lender-site balance (Ticket 2).

Simulation change: for a debt with `known_finance_charge` set, the payoff simulation skips
`interest_rate`-based accrual entirely. That debt's simulated remaining cost is
`remaining_balance + known_finance_charge`, drained by minimum/extra payments the same as
any other debt.

Maintenance: this field goes stale every time a payment posts (interest paid reduces what's
left) — recalculate it after each payment on an affected debt, not just once at setup.

Formula:
```
known_finance_charge = (remaining_scheduled_payments − 1) × payment_amount
+ final_payment_amount
− remaining_balance
```

Status: Decided 2026-08-02. Correctly implemented 2026-07-31.
Note: The initial implementation only overwrote the displayed interest after the loop; the
simulation still accrued interest_rate monthly and started from principal only. Fixed so
`known_finance_charge` is added to the starting remaining balance and interest accrual is
skipped for that debt, matching this ADR.

## ADR-017: Debts Support Non-Monthly Billing Cycles

Decision:
`debts.billing_cycle` and `debts.next_due_date` (both already present in the schema, previously
unused) are now surfaced and editable in the app, and drive scheduling for any debt that isn't
monthly. When `billing_cycle` is `'monthly'`, the existing `due_day`-based flow is unchanged.
When it's anything else (e.g. `'biweekly'`), `next_due_date` is used instead of `due_day` to
determine overdue status and Dashboard listing, and advances by the billing_cycle interval on
clear — reusing the same cycle-advance logic already built for bills, rather than a second copy.

Reason:
Phase 3 assumed all debts reset monthly. In practice, several debts (paycheck-deduction loans,
a payment-plan credit card) are on a biweekly schedule. The columns needed to support this
already existed but were never wired into the UI or the clear/reset logic.

Data correction applied:
```sql
update debts set next_due_date = '2026-07-30' where name = 'GTC';
update debts set next_due_date = '2026-08-01' where name = 'TSP Loan';
update debts set next_due_date = '2026-07-30' where name = 'Schwab Loan';
update debts set billing_cycle = 'biweekly' where name in ('GTC', 'TSP Loan', 'Schwab Loan');
```

Note: GTC is a payment-plan debt being paid off and closed, not a recurring biweekly bill —
no special handling needed; once `remaining_balance` reaches 0 it naturally drops out of the
payoff simulation and active-debt views via the existing `remaining_balance > 0` filter.

### From Lovable update:
Decision: Monthly debts continue using `due_day`; any other `billing_cycle` uses `next_due_date`
for display, editing, overdue checks, and cycle roll-forward. A single helper `debtDueDate()`
resolves a debt's effective due date, and clearing/undo reuse the bill helpers
`advanceDate()`/`reverseDate()`.

Reason: Most debts are monthly with a stable day-of-month, but leases/loans on other cadences
need a real date. Reusing the bill cycle helpers avoids duplicating interval math.

Status: Decided 2026-07-31. Implemented.

---

## ADR-018: Variable-Amount Bills Prompt for Actual Amount at Payment Time

Decision:
When marking a bill as pending (submitted), the app prompts for the actual amount owed this
cycle, defaulting to `bills.amount` as a starting value. The entered amount — not the stored
`bills.amount` — is what gets used for the resulting `transactions` row. `bills.amount` itself
is left unchanged unless the user explicitly edits it separately; it continues to represent a
typical/budgeted amount, not necessarily this cycle's exact bill.

Reason:
`bills.amount` is a single fixed value, and the existing mark-paid flow always submits that
stored amount as the transaction amount. This is correct for fixed bills (rent, subscriptions)
but wrong for variable bills (electric, phone) whose real amount changes month to month —
every payment would silently log the wrong figure. Since quick manual transaction entry
(Phase 4.5) already asks the user for an amount at entry time, prompting for the actual amount
at bill-payment time keeps the same interaction pattern rather than introducing a new one.

Status: Decided 2026-07-31. Not yet implemented.

## ADR-019: Bills Support Variable Amounts and Partial Payments

Decision:
`bills.is_variable_amount` (boolean) gates whether marking a bill pending prompts for the
actual amount owed this cycle. `bills.cycle_amount_due` holds that cycle's real owed amount
when it differs from `bills.amount` (the bill's typical/budgeted figure, left unchanged).
`bills.cycle_paid_to_date` tracks cumulative cleared payments toward the current cycle.
A cycle only resolves (payment_status resets, next_due_date advances) once
cycle_paid_to_date >= cycle_amount_due; underpayment keeps the bill 'pending' and open for
a follow-up payment rather than silently closing the cycle.

Debts are unaffected: clearing a debt payment already reduces remaining_balance by the real
transaction amount (not a fixed minimum), so overpayment on debts already applies as extra
principal reduction with no schema change required — confirmed against Phase 3.5's original
spec.

Reason:
Bills had no way to represent "owed X, paid less than X, remainder still due" — payment_status
assumed one payment fully resolved a cycle. Variable bills (electric, phone) need both a
different amount each cycle and the ability to under-pay without losing track of the shortfall.

Status: Decided 2026-07-31. Implemented.

## ADR-020: 12-month payment schedule and dashboard charts
Decision:
`src/lib/payment-schedule.ts` reuses the payoff simulation rules (minimums on every open
debt, extra + freed minimums rolled onto the top-ranked debt) to emit a per-month allocation
for the next 12 months, driven by `debt_strategy_settings.active_strategy` and
`extra_monthly_payment`. Month check-offs write to an optional
`payment_schedule_checkoffs (household_id, month)` table; when that table does not exist the
hook silently falls back to device-local storage so the screen still works.
`src/lib/net-worth.ts` owns `balanceAsOf()` — most recent snapshot on or before the date
(else `starting_balance`) plus cleared transactions between that snapshot and the date —
and the 6-month trend grouped by `account_type`.

Reason:
The schedule must agree with the Debt Strategy projection, so both consume the same ordering
and rollover rules. Net-worth history needs a point-in-time balance rule distinct from
`src/lib/balances.ts` (which only computes "now"), so it lives in its own module.
Check-off state is household-shared data, but no table exists yet in the connected Supabase
project; the fallback avoids blocking the feature on a manual migration.

Status: Decided 2026-07-31. Implemented.

## ADR-021: Expose accounts.is_spendable and accounts.credit_limit in the UI

Decision:
The account add/edit dialog includes a "Spendable" checkbox bound to `accounts.is_spendable`
and a "Credit limit" currency input bound to `accounts.credit_limit`. The credit-limit field is
only shown when `account_type` is "credit" and is stored as `null` for non-credit accounts.
Balance computation (`src/lib/balances.ts`) is unchanged; this only exposes existing columns.

Reason:
These columns existed in the schema and were already used by spending-balance and net-worth
calculations, but they had no UI affordance, so users couldn't actually maintain them.
Credit limit is only meaningful for credit accounts, so hiding it for other types keeps the
form simple and avoids accidental data entry.

Status: Decided 2026-07-31. Implemented.

## ADR-022: account_type is always stored lowercase

Decision:
The account add/edit dialog normalizes the free-text Type field with `trim().toLowerCase()`
before writing `accounts.account_type`. Display labels are unchanged.

Reason:
The field is a free-text input, so users could save "Checking" while balance/spendable logic
(`src/lib/balances.ts`) compares against lowercase literals such as "checking" and "credit".
Normalizing at write time keeps type filters and balance rules reliable.

Status: Decided 2026-07-31. Implemented.

## ADR-023: Combined Spendable Total Uses Available Credit for Credit Accounts

Decision:
For accounts with account_type = 'credit', the combined spendable total uses available
credit (credit_limit - creditOwed(balance)) instead of raw balance. Checking accounts
continue to contribute their raw spendable balance (per computeBalances in balances.ts).
The per-account credit balance display (amount owed) is unchanged — this only affects
how credit accounts are folded into the combined total.

Reason:
A credit account's raw balance represents debt owed, not money available to spend. Summing
that directly with checking balances understated what's actually usable/available across
the household. Available credit is the meaningful "spendable" figure for a credit account.

Implementation notes:
- balances.ts's computeBalances() currently has no reference to credit_limit — the combined
  total calculation (wherever .spendable values are summed, outside this file) needs a new
  branch: for account_type = 'credit', use credit_limit - creditOwed(spendable) instead of
  spendable directly.
- creditOwed() already exists in balances.ts and is reused here, not duplicated.
- Requires credit_limit to be populated on all credit accounts (recently exposed in the
  account edit dialog) — an account with a null/0 credit_limit will compute available
  credit as 0 or negative; decide whether to treat null credit_limit as "exclude from
  combined total" or "treat as 0 available" before shipping.
- Does not change ADR-013's account inclusion rules (is_spendable = true AND account_type
  in ('checking','credit')) — only changes what value a 'credit' account contributes once
  included.

Status: Decided 2026-08-02. Implemented 2026-07-31 (null/0 credit_limit excludes the account
from the combined total).

## ADR-024: Paycheck-Based Budget Allocation Layer

Decision:
Add a new planning layer parallel to monthly `spending_budgets`/`spending_actuals`, built
around the household's primary income source:

- `income_sources`: recurring/irregular income streams. Exactly one may have `is_primary = true`
  (enforced by partial unique index).
- `income_source_splits`: template for how one primary paycheck deposits across multiple
  accounts on different days (fixed amounts + one remainder split, each with a day_offset from
  the pay date).
- `income_events`: one actual/expected occurrence of any income source (primary or secondary).
- `pay_period_allocations`: slider-based category allocations, keyed to a primary income_event.

Bill/debt-to-paycheck assignment is NOT stored. A period's obligations are computed live as
whichever bills/debts have an effective due date falling within
`[event.expected_date, next primary event's expected_date)`, reusing existing due-date logic
(`debtDueDate()`, bill cycle fields). Secondary income (ANG, UberEats, future second income)
adds to whichever primary period's date range it falls into — it never creates its own
obligation bucket.

The "bottom number" for a period = primary amount + secondary income in range − obligations
in range − sum(allocations) — computed live, never cached.

Paycheck-level planning uses income_sources / income_events / pay_period_allocations
on its own screen; spending_budgets and spending_actuals are untouched. A pay period runs from a
primary income_event's effective date up to (exclusive) the next primary event, or +14 days when
none exists. Allocations are keyed on income_event_id + category_id and stored per household.

Reason:
Obligation timing can't be derived from a fixed cadence (ANG's date moves monthly, UberEats
has none), so auto-assignment must be date-range-based and computed at read time — consistent
with ADR-015's rule that anything which changes on every edit shouldn't be cached. Splitting
one paycheck across 3 accounts on different days is a real, recurring shape (ASRC → SoFi/One/
USAA), not a one-off, so it's modeled as a reusable per-source template rather than one-off
manual entries each period.

Monthly budgets and per-paycheck cash allocation answer different questions; merging them
would overload the Spending screen and its month-locking flow.

This is additive only — `spending_budgets`/`spending_actuals` and all Bills/Debts logic are
unchanged. Some months have 2–3 primary paychecks; this layer handles that naturally since
periods are derived from actual `income_events`, not a fixed monthly bucket.

Known limitation: no manual override yet for "pay this bill from a different check than its
due-date range implies." Due-date-in-range is the only assignment rule for now.

Status: Decided 2026-08-03. Implemented.
### Open Question — Future Cross-Reference (not yet decided)

Two items surfaced while comparing this ADR against reference-app screenshots
(2026-08-03). Neither requires action now; both should be revisited at the
noted trigger point.

**1. Stored bill→paycheck override (vs. current date-range-only assignment)**
Reference apps store an explicit "which paycheck pays this bill" tag per bill,
rather than deriving it from due-date-in-range. This is the same gap already
named in this ADR's "Known limitation." Two options if it becomes a real need:
- Add an optional `bills.forced_income_event_id` override column, checked
  before falling back to date-range logic, or
- Treat a wrong assignment as a due-date data problem (fix the bill's date)
  rather than adding an override mechanism.
Revisit when: date-range misassignment actually happens in practice, not
speculatively.

**2. Allocations may eventually need to target savings goals, not just categories**
Reference apps let one "distribute paycheck" action fill both spending
categories and savings goals in the same flow. `pay_period_allocations`
currently only supports `category_id`. Once ADR-025 (Savings Goals) is
implemented, decide between:
- Adding a nullable `goal_id` to `pay_period_allocations` alongside
  `category_id` (mutually exclusive — exactly one set per row), or
- Keeping goal contributions purely in the transactions ledger via
  `linked_goal_id` (ADR-025), with no representation in the pay-period
  allocation/planning layer at all.
Revisit when: ADR-026 is implemented and this becomes a concrete UX decision.


## ADR-025: zod upgraded to v4
Decision: Upgrade zod from ^3.24 to ^4.
Reason: @tanstack/start-plugin-core calls `.prefault()`, which only exists in zod v4; on zod 3 the
Vite config failed to load and the dev server would not start.
Status: Decided 2026-08-03. Implemented.

## ADR-026: Savings Goals (Sinking Funds)

Decision:
Add a new `savings_goals` table (household_id, name, target_amount, target_date,
current_amount, icon/emoji, created_at, updated_at) with standard household RLS.
Add/withdraw actions create a `transactions` row with a new `linked_goal_id uuid
references savings_goals(id)` column, mirroring the existing linked_bill_id/
linked_debt_id pattern. A goal's current_amount is derived the same way account
balances are: sum of cleared transactions linked to that goal (not a separately
maintained running total), for consistency with ADR-003 (transactions as source
of truth).

Reason:
Reference apps show a common, clearly useful pattern (Emergency Fund, Vacation,
Christmas) — a target amount/date with a "monthly amount needed" calculation and
Add/Withdraw actions. Nothing in the current schema supports this; it's a new
first-class concept alongside bills/debts, not a variant of either.

Schema change:
```sql
create table savings_goals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  icon text,
  target_amount numeric(12,2) not null,
  target_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table transactions add column linked_goal_id uuid references savings_goals(id);

alter table savings_goals enable row level security;
create policy "household access" on savings_goals for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
```

Migration steps:
1. Run the SQL above.
2. current_amount is NOT a stored column — compute as
   `sum(transactions.amount) where linked_goal_id = goal.id and status = 'cleared'`,
   same pattern as account balances.
3. "Monthly amount needed" = `(target_amount - current_amount) / months_remaining
   (from target_date)` — computed client-side, not stored.
4. Add/Withdraw UI reuses the existing quick-transaction entry pattern (Phase 4.5)
   with linked_goal_id set instead of linked_bill_id/linked_debt_id.

Status: Decided — pending your approval. Not implemented.
## ADR-026: Visual language pass (cards, hero, rings, icon-only nav)
Decision: Adopt a soft-neutral background with white 16px shadowed cards, one
gradient hero card on the Dashboard, ProgressRing/ItemBar/EmojiIcon primitives in
src/components/viz.tsx, bold dollar amounts with small uppercase gray labels, and
an icon-only bottom nav whose active tab uses a filled rounded chip.
Reason: Match the reference screenshots' friendlier, thumb-friendly mobile feel
without touching data fetching, RLS, the pending/cleared ledger flow, or ADR-012.
Status: Decided 2026-08-03. Implemented.
