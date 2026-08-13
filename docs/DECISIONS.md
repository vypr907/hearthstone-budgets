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

### Correction 2026-08-03: Account Resolution Is Household-Wide, Not Institution-Scoped

The original decision blocked payment when the bill/debt's own institution had zero
accounts underneath it. This assumed every institution eventually gets an account,
which is false for vendor/subscription institutions (Starz, utilities, etc.) that are
never balance-bearing — the paying account always belongs to a different institution
(a bank or credit card).

Revised behavior: when marking a bill/debt pending, prompt for the paying account
from the full list of household accounts (not filtered by the bill's institution).
Default the selection to whichever account last paid this specific bill/debt (most
recent transactions.account_id for that linked_bill_id/linked_debt_id), falling back
to no default if there's no payment history yet. Never block on "institution has zero
accounts" — that condition is expected and normal for most institutions.

Correction Status: Decided 2026-08-03. Implemented 2026-08-03.

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

*Superseded in practice by ADR-036's ledger-derived state machine -- see there for the current definition of 'cleared'*

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


### Correction to ADR-017: due_day Must Be Nullable

Decision: debts.due_day is changed from not null to nullable.

Reason: ADR-017 established that non-monthly debts (biweekly, quarterly, custom, etc.) use next_due_date instead of due_day, with only monthly debts keeping due_day. The original Phase 1 schema, however, created due_day as not null, and no migration ever relaxed it when ADR-017 shipped — so the app correctly omits due_day for a non-monthly debt, but Postgres still rejects the insert. Same category of gap as ADR-048's correction to starting_balance (invoices don't have one, so that NOT NULL had to be dropped too); due_day simply never got the equivalent fix at the time.

Found 2026-08-12: creating an Advance-type debt on a biweekly cycle failed with null value in column "due_day" violates not-null constraint.

Migration:

```sql
alter table public.debts alter column due_day drop not null;
notify pgrst, 'reload schema';
```

No app code change required — the debt form already omits due_day for non-monthly cycles per ADR-017; only the database was out of sync.

Status: Decided 2026-08-12. SQL ready to run.

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


## ADR-026: Visual language pass (cards, hero, rings, icon-only nav)
Decision: Adopt a soft-neutral background with white 16px shadowed cards, one
gradient hero card on the Dashboard, ProgressRing/ItemBar/EmojiIcon primitives in
src/components/viz.tsx, bold dollar amounts with small uppercase gray labels, and
an icon-only bottom nav whose active tab uses a filled rounded chip.
Reason: Match the reference screenshots' friendlier, thumb-friendly mobile feel
without touching data fetching, RLS, the pending/cleared ledger flow, or ADR-012.
Status: Decided 2026-08-03. Implemented.

## ADR-027: Savings Goals (Sinking Funds)

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

Status: Decided 2026-08-03. Implemented (UI + derived current_amount). SQL must be
run manually in the self-managed Supabase project; no goal <-> pay_period_allocations
link was built (see ADR-024 cross-reference note).

## ADR-028: One-Page Status Snapshot Export

Decision:
Add a printable "Status Snapshot" view — a single-page, visual summary of household
financial status as of the current moment — exportable as an image (default) or PDF.
Add `households.export_format text not null default 'png' check (export_format in
('png','pdf'))` as a shared household setting, editable from a Settings screen. No
other schema changes; the report is composed entirely from existing tables (bills,
debts, income_events).

Report contents (all read-only, computed live at export time):
- Bills & Debts list with current payment_status, grouped by status (overdue first)
- Overdue amount total, and per-item overdue amount (effective due date < today,
  not cleared)
- Upcoming bills/debts due within the next 14 days from report date
- Next primary pay date (soonest primary income_event with expected_date >= today,
  per ADR-024)

Reason:
A quick, shareable "where do we stand right now" view is useful for a 2-person
household without either person opening the full app. Since both users already
see identical shared data, a single export format setting at the household level
(not per-user) is enough — this isn't a personal preference, it's about which
format is easiest to share/print for this household.

Implementation notes:
- Render as a normal React component (reuse existing card/typography components
  from ADR-026's viz.tsx where they fit) sized for a single printable page.
- Export via html2canvas → PNG by default. When export_format = 'pdf', pipe the
  same canvas through jsPDF as a single-page PDF instead of a second parallel
  implementation.
- Report date is always "now" — no historical/backdated report in this version.
- "Upcoming" window is a fixed 14 days for this first version, not user-configurable.

Status: Decided 2026-08-03. Implemented 2026-08-03 (/app/snapshot + /app/settings). Uses html2canvas-pro (drop-in html2canvas fork) because html2canvas 1.4.1 cannot parse the app's oklch color tokens.

### Addition 2026-08-06
Decision: The snapshot also renders (a) a Balances card with per-account-type subtotals plus
the ADR-023 combined spendable total, (b) a pay-period progress bar of covered vs. still owed
for the current pay period (calendar month fallback), and (c) a rule-based text summary from
`buildSnapshotSummary()` in src/lib/snapshot.ts.
Reason: The one-page export needed context (what's in the accounts, how far through the period
we are) rather than only a due list. The summary is isolated in one pure function with plain
string templates so an LLM-generated version can replace it without touching the UI.
Status: Decided 2026-08-06. Implemented.

## ADR-029: Category Visual Metadata (Icon, Color)

Decision:
Add `categories.icon text` and `categories.color text` (hex or Tailwind token).
Both nullable — existing categories without a value fall back to a default
icon/gray color in the UI rather than requiring a backfill.

Reason:
Matches the icon/color treatment already used for institution_type and the
visual language established in ADR-026. Purely additive display metadata,
no impact on category matching/grouping logic (ADR-011, ADR-012).

Status: Decided 2026-08-03. Implemented 2026-08-03 (/app/categories icon+colour
picker; icon + left-border colour accent on Categories and Spending rows,
falling back to a gray tag icon when null).


## ADR-030: Institution Logo Field

Decision:
Add `institutions.logo_url text` (nullable). Auto-populate on institution
create/edit by deriving a favicon URL from the institution's existing
`login_url` domain via Google's public favicon service
(`https://www.google.com/s2/favicons?domain={domain}&sz=128`) — no API key,
no signup, no rate-limit concerns for a 2-person app's request volume.
User can override with a manually pasted `logo_url` at any time.

Reason:
Clearbit's free Logo API (the common go-to for this) was permanently shut
down December 8, 2025 — no longer usable. Paid alternatives (logo.dev,
Brandfetch) require API key management and signup for what's a cosmetic,
low-stakes feature in a private household app. Google's favicon endpoint is
lower-resolution (16-128px, not a full vector logo) but requires zero setup
and has no usage limits relevant here. If visual quality proves unsatisfying
later, this can be swapped for a keyed service without a schema change —
logo_url stays a plain URL string either way.

Status: Decided 2026-08-03. Implemented 2026-08-03 (institution form logo_url
field pre-filled with the derived favicon URL as a visible, editable suggestion;
list/detail render the logo with an institution-type icon fallback on null or
image load error; institution_type is title-cased for display via a code-side
lookup map; Institutions gained a UI-only Group by (type/category) control and
linked Bills/Debts sections in detail).

## ADR-031: Institution-Level Balance & Due Aggregation

Decision:
Institutions display two computed (not stored) figures, definition depends on
institution type:

- **Account-bearing institutions** (bank, credit_card, financial — anything
  with accounts underneath): Current Balance = sum of linked accounts' current
  balance (reusing balances.ts's existing per-account formula). Current Due is
  not shown for this type — a bank isn't "due" anything as a household obligation.

- **Bill/debt institutions** (utility, subscription, medical, lendor_lessor,
  tool, or any institution with no accounts underneath): Current Balance =
  total still owed across everything linked — sum of debts.remaining_balance
  for linked debts, plus sum of open bill cycle amounts (cycle_amount_due if
  set, else amount) for linked bills that aren't fully paid. Current Due =
  just the currently unpaid cycle's amount: for bills, the same open-cycle
  amount minus cycle_paid_to_date (ADR-019); for debts, minimum_payment for
  the current due period. This is a subset of Current Balance, not a separate
  total.

Both figures are computed live at render time, consistent with ADR-015/ADR-020's
rule against caching anything that changes on every edit — no new columns.

Reason:
A bank's "balance" and an unpaid medical bill's "amount owed" are different
concepts that happened to share a UI slot request — separating Current Balance
(total exposure) from Current Due (what's actionable right now) matches how
Bills/Debts already distinguish total remaining vs. this-cycle's amount
(ADR-019), rather than inventing a third definition.

Status: Decided 2026-08-03. Implemented 2026-08-03 in
`computeInstitutionTotals()` (src/lib/balances.ts), rendered on the Institutions
list rows and detail view. Debts count toward Current Due when debtDueDate()
(ADR-017) is on or before today; bills use billCycleDue()/billRemainingOwed()
(ADR-019). Institutions with neither accounts nor obligations render "—".

## ADR-032: Paycheck-Deduction Debts Excluded from Cash Obligations

Decision:
Add `debts.is_paycheck_deduction boolean not null default false`. When true, the debt
is excluded from Paycheck Budget's obligations-in-range total and Dashboard's monthly
obligations total (it never touches a spendable account), but still appears in Debts,
Everything, and the payoff-strategy calculator unchanged.

Reason:
TSP Loan and similar debts are serviced via payroll/HSA deduction before the paycheck
ever hits a tracked account. Counting them as "due this period" double-subtracts money
that was never actually available to spend.

Status: Decided 2026-08-04. Implemented 2026-08-04 — `is_paycheck_deduction` toggle on
the debt form, badge on Debts list/detail, excluded from `obligationsInRange()` and shown
via `deductedObligationsInRange()` on Paycheck Budget. Dashboard exclusion pending.

## ADR-033: Auto-Generated Envelope Goals for Non-Monthly Bills

Decision:
Add `savings_goals.account_id` (nullable FK to accounts — several goals may share one
account, e.g. all point at a "Annuals" savings account) and `savings_goals.linked_bill_id`
(nullable FK to bills, unique). When a bill's billing_cycle is quarterly, bimonthly,
annually, or custom (i.e. > 1 month), the app auto-creates one savings_goals row with
linked_bill_id set, target_amount = the bill's amount, target_date = the bill's
next_due_date. Biweekly bills do NOT get an envelope — their monthly-equivalent is
just amount × 2, no separate saving needed since they occur within the month.

Monthly-equivalent (for obligations/budget totals per ADR-034):
- monthly: amount
- biweekly: amount × 2
- quarterly: amount / 3
- bimonthly: amount / 2
- annually: amount / 12
- custom: not automatically prorated — flagged for manual monthly-equivalent entry
  (open question, see below)

A dedicated "Add to envelope" action on the bill card creates a transaction with
linked_goal_id = the envelope's id, status='cleared', separate from the bill's own
payment transaction (linked_bill_id) to its institution. This lets money be set aside
ahead of the due date without it looking like the bill was paid.

Reason:
A quarterly $18 bill (Solo) shouldn't blow a monthly budget the one month it's due,
nor should it be invisible the other two months. Prorating it into monthly obligations
plus a real envelope balance solves both — matches the existing savings_goals /
ledger-derived-balance pattern (ADR-027) instead of inventing a second mechanism.

Open question: `custom` billing_cycle has no fixed interval, so it can't be
auto-prorated the same way. Needs either a stored cycle-length-in-months field or
manual monthly-equivalent entry — deferred until a real `custom` bill needs this.

Status: Decided 2026-08-04. Partly implemented 2026-08-04 — `monthlyEquivalent()` /
`needsEnvelope()` in format.ts, envelope auto-creation in `useUpsertBill()`, optional
`account_id` on the goal form. The bill-card "Add to envelope" action ships the compact SetAsideAction (2026-08-06).

## ADR-034: Budget Totals Include Linked Bill Amounts, Shown as Two Parts

Decision:
For a spending category, "Budgeted" displayed on Dashboard/Spending =
spending_budgets.budgeted_amount + sum of monthly-equivalent amounts of bills linked
to that category_id (via ADR-033's monthly-equivalent, see below). The two parts are
always shown separately (e.g. "$20 spending + $12.65 bills = $32.65"), never merged
into one opaque number. Same split applies to "Spent": manual/ledger spending vs.
bill payments already made this cycle.

The Dashboard hero card is rebuilt around Spendable balance as the primary number
(not obligations), absorbing the existing lower "monthly obligations" breakdown card
into itself rather than showing both. A new card is added: bills/debts amount still
owed this pay period/month, grouped by category. Net Worth Trend moves to the bottom
of the Dashboard.

Reason:
Rocket Money/Mint-style "$40 left" hides that $30 of it is already spoken for by an
upcoming bill. Splitting spendable-vs-committed makes the number trustworthy at a
glance instead of requiring mental math against the Bills screen.

Status: Decided 2026-08-04. Dashboard portion implemented 2026-08-06 (hero rebuilt around
combined spendable with per-period bill/debt set-aside totals, "still owed this period"
card grouped by category, Net Worth Trend moved to the bottom, overdue amounts and payoff
progress corrected). Budget/actual spending-vs-bills split implemented 2026-08-06 on the
Spending screen and the Dashboard budget-vs-actual card.


## ADR-035: Universal Partial Payments for Bills and Debts
Decision:
Every bill and debt submit/clear prompts for the amount being paid now, defaulting to
what is still owed this cycle and editable down for a partial payment. Bills fix
`cycle_amount_due` on the first payment of a cycle (variable bills via the existing
"what's owed this cycle" prompt, fixed bills automatically from `bills.amount`). Debts
gain `cycle_paid_to_date`, mirroring bills: a cleared payment credits the cycle and
reduces `remaining_balance` by the real amount paid; the cycle only resolves (reset
counters, advance non-monthly due dates) once `cycle_paid_to_date >= minimum_payment`,
otherwise the item stays pending and Submit stays available for a follow-up payment.
Cycle crediting lives in one shared `applyClearedPayment()` helper, also used by manual
transactions linked to a bill or debt.
Reason:
Real payments are frequently partial, and the old flow made a pending item's Submit
button a no-op and only prompted for variable bills, so follow-up payments could not be
recorded and cycles resolved on the first payment regardless of amount.
Status: Decided 2026-08-05. Implemented.
Notes: monthly debts have no `next_due_date` to roll, so a resolved monthly cycle keeps
`payment_status = 'cleared'` rather than resetting to 'unpaid'.

## ADR-036: Ledger-Derived 4-State Payment Cycle (Supersedes ADR-010)

Decision:
Replace the fixed unpaid → pending → cleared → unpaid tap cycle (ADR-010) with a state
derived live from the ledger, shared across Bills, Debts, and Everything via the existing
payments.ts / ledger-state.ts modules:

- **UNPAID** — no transactions this cycle. Tap: prompt for amount, create a pending
  transaction → PENDING.
- **PENDING** — latest transaction for this cycle has status='pending'. Tap: clear that
  transaction (cycle_paid_to_date += amount, per ADR-035). If remaining > 0 → PARTIAL.
  If remaining <= 0 → CLEARED (cycle resolves: payment_status unpaid, due date advances,
  cycle_paid_to_date resets, per existing ADR-019/035 rollover).
- **PARTIAL** — no pending transaction, but cleared sum < amount due. Tap: prompt for
  amount, create a new pending transaction → PENDING.
- **CLEARED** — cleared sum >= amount due (cycle already resolved). Tap: show a confirm
  dialog ("This will reset this bill/debt — undo all payments this cycle?"). On confirm,
  full reversal per ADR-008, extended to delete ALL transactions tied to the cycle just
  resolved (not only the most recent), reset cycle_paid_to_date to 0, revert payment_status
  and due date → UNPAID. On cancel, no change.

Icons: UNPAID = neutral/empty, PENDING = clock (yellow), PARTIAL = remaining-balance
indicator (orange), CLEARED = checkmark (green).

Reason:
ADR-010's fixed 3-tap cycle assumed exactly one transaction per cycle. ADR-035 made that
false — a cycle can need any number of submit/clear rounds. Deriving state from the actual
ledger (not tap count) makes Bills, Debts, and Everything agree by construction, since
they already share payments.ts, and finally makes Undo only reachable from a genuinely
fully-paid cycle instead of firing on whatever the 3rd tap happens to be.

Supersedes: ADR-010. Extends: ADR-008 (reversal now clears every transaction in the
resolved cycle, not just the latest one) and ADR-009 (checked = CLEARED state, unchanged
in spirit, now precisely defined).

Status: Decided 2026-08-04. Implemented 2026-08-05.
Notes: state derives from `deriveCycleInfo()` in ledger-state.ts. Because clearing the
final payment advances the due date, a resolved cycle's transactions fall into the
previous window; the derivation looks back one interval (while today <= the new cycle
start) so a just-resolved item reads CLEARED rather than UNPAID. Reset uses
`useResetCycle()` and deletes every transaction in that window.

## ADR-037: Payable-First Payment Writes and Repair Delete
Decision:
Submit and Clear write the bill/debt row before writing the ledger row, and every
bill/debt payment update goes through `updateRow()`, which uses `.select("id")` and throws
if no row changed. Ledger rows linked to a bill/debt can be deleted from the bill/debt
detail view via `useDeleteLinkedTransaction()` (repair only — the payable is untouched).

Reason:
A missing `debts.cycle_paid_to_date` column made the payable update fail after the ledger
write had already succeeded, leaving extra/cleared transactions with a debt whose status,
remaining balance, cycle paid and due date never moved. Ordering the payable write first
makes that failure mode a clean no-op, verified updates turn silent 0-row writes into
visible errors, and the repair delete lets the user clean up rows stranded by earlier
failures without hand-editing the database.

A repair scan (`findStrandedDebtPayments()` / `StrandedDebtRepair`, on the Debts screen)
lists debts whose current cycle has cleared ledger rows while `cycle_paid_to_date` is
still 0 and the cycle never resolved — the exact pre-fix symptom — and deletes those rows
so the payment can be redone through the normal Submit / Mark cleared flow.

Extends: ADR-035, ADR-036.

Status: Decided 2026-08-05. Implemented 2026-08-05.

## ADR-038: Envelope Set Aside Transfers

Decision:
Bills with a linked envelope goal (savings_goals.linked_bill_id, from ADR-033) gain a
"Set Aside" action. Tapping it prompts for a source account (any household account) and
an amount, defaulting to monthlyEquivalent(bill) (ADR-033, computed live — no stored
monthly_amount column). If the envelope's account_id is unset, the user is first prompted
to choose/assign a destination account, which is saved back to savings_goals.account_id.

Confirming creates two cleared transactions in one action (a true transfer, not a single
tagged entry):
1. Debit: -amount on the chosen source account, no linked_goal_id, description
   "Set aside: <bill name> → <envelope name>".
2. Credit: +amount on the envelope's account_id, linked_goal_id = the envelope's id.

The credit transaction is what drives the envelope's derived current_amount (ADR-027,
unchanged) — the debit transaction only reduces the source account's balance, exactly
like a normal manual outflow. No new "transfer" table or transfer_id is introduced; the
pairing exists only in the UI action, not as a stored relationship.

Reason:
An envelope's saved balance should represent real money that actually left a spendable
account, not just a mental earmark — otherwise the household's total balance would be
double-counted (spendable + envelope, for money that was never actually moved). A true
two-sided transfer keeps every account's balance accurate to the real bank picture.

Open item: no guard against setting aside more than once in the same month — left manual/
unrestricted for now; revisit if double set-asides become a real problem in practice.

Status: Decided 2026-08-05. Implemented 2026-08-05 (`src/components/SetAsideAction.tsx`,
rendered on the bill detail view when a linked envelope goal exists).

## ADR-039: Savings Goals in Pay Period Allocations (Resolves ADR-024 Open Question)

Decision:
Add `pay_period_allocations.goal_id uuid references savings_goals(id)` (nullable).
`category_id` becomes nullable. Exactly one of `category_id` / `goal_id` must be set,
enforced by a check constraint — a row allocates to a spending category OR a savings
goal, never both. The Paycheck Budget allocation screen gains goal rows alongside
category rows, using the same slider/input UI, writing to goal_id instead of category_id.

Reason:
Resolves the open question logged in ADR-024's cross-reference note: households want to
manually direct extra paycheck money into a specific savings goal (e.g. an envelope) in
the same screen where they already allocate to spending categories, rather than only
being able to fund goals through the separate Add/Withdraw action.

Status: Decided 2026-08-05. Implemented 2026-08-05. `useSetAllocation()` takes
`categoryId` OR `goalId` and rejects both/neither client-side before the DB check
constraint fires; the period "Left to allocate" figure counts goal rows alongside
category rows.

## ADR-040: Generalized Custom Billing Cycle (cycle_interval_days) KEEP VERSION

Decision:
Add `cycle_interval_days integer` to both `bills` and `debts`, used only when `billing_cycle = 'custom'`. Generalize the shared `advanceDate()`/`reverseDate()` helpers to accept a day-count for `custom` (reading `cycle_interval_days`) instead of only handling the fixed enum intervals. Generalize `monthlyEquivalent()` (src/lib/format.ts, ADR-033) the same way: for `custom`, `amount * (365.25 / cycle_interval_days) / 12`.

- No new `billing_cycle` enum values are added (e.g. no `every_4_weeks`) — any day-count cadence, current or future, is expressed via `custom` + `cycle_interval_days` instead of a growing enum. `bills.cycle_interval_days` and `debts cycle_interval_days` (integer, nullable) store a day count and are the only interval storage for `billing_cycle = 'custom'`.
- Forms show a number input + Days/Weeks toggle only when the cycle is Custom;
  weeks are multiplied by 7 before writing. Saving a custom bill/debt without a
  value is blocked. On edit the unit is derived from the stored day count
  (divisible by 7 and >= 7 -> Weeks, else Days) — no stored unit preference.
- `shiftDate()`/`advanceDate()`/`reverseDate()` take an optional `intervalDays`
  and add a `custom` branch shifting by that many days (same pattern as the
  14-day biweekly branch). A custom cycle with no interval throws
  `MissingCycleIntervalError` so the failure surfaces instead of silently
  no-op'ing; read-only/derivation paths use `shiftDateSafe()` which keeps the
  date unchanged rather than throwing mid-render.
- `monthlyEquivalent()` prorates custom cycles as
  `amount * (365.25 / cycle_interval_days) / 12`, returning null when unset.


Reason:
ADR-033 flagged `custom` as unprorated and non-advancing, with two options: add enum values per cadence, or generalize with a stored interval. Given more non-monthly cadences are expected (a 4-week subscription now, others later), the
interval column is the one-time fix — each new odd cadence becomes a data entry, not a schema/code change.

Schema change:
```sql
alter table bills add column cycle_interval_days integer;
alter table debts add column cycle_interval_days integer;
```

`cycle_interval_days` is nullable; required only when `billing_cycle = 'custom'`
(enforced in the UI form, not a DB constraint, consistent with existing
`is_variable_amount`-gated fields like `cycle_amount_due`).

Migration steps:
1. Run the SQL above.
2. Bill/debt form: when Billing Cycle = "Custom", show two inputs — a number field and
   a Days/Weeks unit selector. The stored cycle_interval_days is always in days: when
   the user picks "Weeks," multiply their entered number by 7 before saving (e.g. "4
   weeks" saves as 28). The unit selector is a UI-only convenience — cycle_interval_days
   remains the single source of truth, so editing an existing custom bill/debt shows
   whichever unit divides evenly (weeks if divisible by 7 and >= 7, else days), not a
   separately stored preference.
3. `advanceDate()`/`reverseDate()`: add a `custom` branch reading
   `cycle_interval_days` (fallback: treat missing value as an error state, not a silent no-op — a custom bill without an interval shouldn't advance).
4. `monthlyEquivalent()`: add the same `custom` branch.
5. Existing `custom` rows (if any) will have `cycle_interval_days = null` until
   edited — they keep today's non-advancing behavior until then, no backfill required.

Status: Decided 2026-08-06. Implemented.


## ADR-041: Manual Override for Spending Actuals (amends ADR-012)

Decision:
`spending_actuals.is_manual_override boolean default false` decides which value a Spending cell shows. Every `actual_amount` cell is editable, for any month, whether or not transactions exist. Rendering priority per (category_id, month): manual override wins; else the ledger sum of that category's transactions that month (ADR-012); else the stored `actual_amount`.

- Saving an edit writes `actual_amount` and sets `is_manual_override = true`. It never creates, edits, or deletes `transactions` rows.
- Editing a cell that is currently ledger-derived (override false + transactions exist) first shows a one-time confirm dialog; cancel makes no change.
- Overridden cells show a pencil indicator that doubles as a revert action: it sets `is_manual_override = false`, keeping the stored `actual_amount` but restoring ledger-derived-first display.

Reason:
ADR-012 locked cells whenever transactions existed, so a partially-logged month could never be corrected to the real total. The override flag keeps the ledger as the default source of truth while letting a human total win when they say so.

Status: Decided 2026-08-06. Override mechanism implemented 2026-08-06. Month
navigation (prev/next arrows above the category list, defaulting to the current
calendar month, with "Start new month" still anchored to the ledger's newest
month) implemented 2026-08-06 — the edit/override flow applies to the selected
month.



## ADR-042: billing_cycle and manual_or_auto Are Always Stored Lowercase (Extends ADR-022's Pattern)

Decision:
The bill and debt add/edit forms normalize both billing_cycle and manual_or_auto with
.trim().toLowerCase() before writing, identical to ADR-022's account_type rule. A
one-time data correction lowercases existing non-lowercase values in both columns,
across bills and debts.

Reason:
Both columns existed in mixed case (e.g. "Monthly"/"Auto" instead of "monthly"/"auto"),
which List/Detail views tolerated via a display-formatter but which broke the Edit
forms' selects, since select options match on exact value. Same root cause and same
fix pattern as ADR-022, applied to two more free-text-turned-enum columns.

Verified scope (2026-08-06):
- debts.billing_cycle: 30 of 35 rows are "Monthly" (capitalized); bills.billing_cycle
  is already all-lowercase and unaffected.
- bills.manual_or_auto: all 39 non-null rows are "Auto"/"Manual" (capitalized).
- debts.manual_or_auto: all 33 non-null rows are "Auto"/"Manual" (capitalized); 2 rows
  are null (unaffected, left as-is).

Status: Decided 2026-08-06. Not yet implemented.

## ADR-043: Spend history hints on paycheck allocations & schedule history
Decision:
Each category allocation row on the Paycheck Budget screen shows "Last month $X ·
3-mo avg $Y" derived from buildActualResolver() (same ledger/override rules as the
Spending screen), plus a "Use avg" shortcut that writes the rounded average as the
allocation. The Payment Schedule screen gains a collapsible "Previous months"
section listing the last 6 calendar months plus any older checked-off month, each
with its check-off toggle only — no per-debt breakdown.

Reason:
Allocating blind led to guesswork; the resolver already computes per-month category
spend, so reusing it costs no new queries. Past schedule months were dropped entirely
at month rollover, losing the check-off record; past per-debt amounts cannot be
re-simulated from today's balances, so history shows month + paid state only.

Status: Decided 2026-08-06. Implemented.

## ADR-044: Split Transactions via split_group_id

Decision:
Add `transactions.split_group_id uuid` (nullable, no FK — self-referencing group tag,
not a parent row). Splitting a purchase writes N transaction rows sharing the same
split_group_id, account_id, transaction_date, and status, each with its own
category_id and amount, summing to the entered total. Editing a split re-deletes and
re-inserts all rows in the group rather than patching individual lines, avoiding
partial-state bugs.

Split transactions are manual entries only (no linked_bill_id/linked_debt_id) — bill/
debt payments stay single-row, since they're tied to one payable and one cycle.

Reason:
balances.ts, spending-actuals.ts, and every other consumer already aggregate
transactions by summing amounts per account/category/month (ADR-012, ADR-013) — they
need zero changes to handle more rows. A parent/child line-item table would require
every consumer to special-case aggregation for no benefit, violating "reuse before
create."

Schema change:
```sql
alter table transactions add column split_group_id uuid;
```

Status: Decided 2026-08-10. Not yet implemented.


## ADR-045: Invoices Reuse debts; New debt_adjustments Table for Non-Payment Balance Changes

Decision:
Invoices are debts with `debt_type = 'invoice'` (added to the existing debt_type
values) — no new table for the entity itself. `interest_rate`, `minimum_payment`,
`priority_order`, and the payoff-strategy calculator are simply left at their
defaults/unused for invoice-type debts; nothing about the schema forces those fields.

Add `debt_adjustments`: a signed, non-payment change to a debt's remaining_balance —
insurance coverage, an insurance discount, a late fee, an NSF fee, or similar. Unlike
a payment (a `transactions` row reducing remaining_balance by real money leaving an
account), an adjustment reduces or increases what's owed with no corresponding
account outflow/inflow. Creating an adjustment writes remaining_balance += amount
immediately (negative amount = reduces balance, e.g. insurance covered; positive =
increases it, e.g. late fee).

Reason:
A medical invoice's real owed amount moves for reasons other than a payment — insurer
adjustments and fees are common and need to be reflected in remaining_balance without
being misrepresented as money paid from an account (which would corrupt account
balances) or silently edited into starting_balance/remaining_balance by hand (which
loses the "why did this change" history). A separate ledger for non-payment balance
changes, parallel to transactions for payments, keeps both histories honest and
auditable — consistent with ADR-003's "transactions are the source of truth for money
movement" by NOT overloading transactions with non-movement events.

known_finance_charge (ADR-016) is unaffected — adjustments change remaining_balance
directly and don't interact with interest/finance-charge calculation.

Schema change:
```sql
create table debt_adjustments (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  debt_id uuid not null references debts(id) on delete cascade,
  amount numeric(12,2) not null, -- signed: negative reduces remaining_balance
                                  -- (insurance covered, discount), positive increases
                                  -- it (late fee, NSF fee)
  adjustment_type text, -- free text: 'insurance_covered' | 'insurance_discount' |
                         -- 'late_fee' | 'nsf_fee' | 'other'
  description text,
  adjustment_date date not null default current_date,
  created_at timestamptz not null default now()
);

alter table debt_adjustments enable row level security;
create policy "household access" on debt_adjustments for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
```

Migration steps:
1. Run the SQL above.
2. Debt detail view gains an "Adjustments" section (list + add form), same visual
   pattern as the existing "Recent transactions" section.
3. Adding an adjustment updates debts.remaining_balance by the signed amount
   immediately, same immediacy as a cleared payment (ADR-035).
4. Deleting an adjustment reverses it: remaining_balance -= amount (mirrors the
   existing repair-delete pattern from ADR-037, not a full undo dialog).
5. debt_type gains "invoice" as a valid free-text value alongside Medical/Credit
   Card/Loan/Other/Advance — no constraint enforced (debt_type is already
   unconstrained free text per current schema).

Status: Decided 2026-08-10. Not yet implemented.

## ADR-046: Transaction Fees on Bill/Debt Payments (Fee Excluded from Cycle Credit)

Decision:
The bill/debt payment flow (pay-flow.tsx, ADR-035/036/037) gains an optional "fee"
field alongside the payment amount. Confirming a payment with a fee set writes TWO
transactions on the same account/date, not one:

1. The payment transaction: amount = the entered payment amount, linked_bill_id or
   linked_debt_id set as normal — this is the only row that credits
   cycle_paid_to_date / reduces remaining_balance, unchanged from ADR-035.
2. A fee transaction: amount = the fee, no linked_bill_id/linked_debt_id,
   category_id defaulting to the household's "Fees" category if one exists,
   description "Fee: <bill/debt name>".

Both rows debit the paying account, so the account's balance correctly reflects the
full amount that left it (e.g. $31.20), while only $30 counts toward the bill/debt's
payoff/cycle math. This applies to both fixed and partial payments (ADR-035) — the
fee is not part of "amount paid this cycle" in any case.

Reason:
A processing/late/NSF fee is real money leaving the account but isn't progress
against what's owed — crediting it to cycle_paid_to_date or remaining_balance would
make a bill or debt look more paid-off than it is, while omitting it from the account
debit would make the account balance wrong. Two unlinked-vs-linked rows on the same
account already solves an analogous problem in ADR-038 (Set Aside); reusing that
shape here avoids a third payment-fee mechanism and needs no schema change.

Scope note: distinct from ADR-045's debt_adjustments — that table changes
remaining_balance with NO account movement (insurance coverage, a late fee added to
what's owed). This ADR is the mirror case: real account movement that does NOT
change remaining_balance/cycle_paid_to_date. A late fee could be modeled either way
depending on whether it was actually paid out-of-pocket (this ADR) or just added to
the balance owed (ADR-045) — the household decides per fee, the mechanisms aren't
mutually exclusive.

Status: Decided 2026-08-10. Implemented 2026-08-11 (fee field in pay-flow.tsx; fee row
uses the household "Fees" category when one exists). Follow-up (2026-08-11):
`insertFeeTransaction` now auto-creates a "Fees" category if none exists, so fee
rows are always categorised rather than occasionally uncategorised.

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

## ADR-048: Invoices as one-time charges with optional payment plans
Decision:
`debt_type = 'invoice'` is modelled as a real dated charge rather than a
recurring debt.
1. `billing_cycle` gains the value `one_time`. A one-time charge stores a real
   `next_due_date` (labelled "Due date" in the form) and no `due_day`; it never
   rolls forward — `advanceDate`/`shiftDate` return the same date, and
   `monthlyEquivalent` returns null.
2. Picking the Invoice type on a new debt defaults the cycle to `one_time`.
   The cycle stays user-editable, so an invoice can still be recurring.
3. The debt form always exposes both "Amount still owed" (`remaining_balance`)
   and "Original invoice amount" (`starting_balance`). Saving falls back to the
   remaining balance when the original is blank, so the not-null constraint on
   `debts.starting_balance` can never be tripped from the UI.
4. Payment plans are explicit: an `on_payment_plan` switch reveals
   `plan_payment_count` (nullable — "unknown" is valid) and
   `plan_final_payment` (nullable — "same amount" is valid). The instalment
   amount reuses `minimum_payment`, which the form relabels to "Payment amount"
   while a plan is on. No new payoff engine: existing cycle logic drives it.
5. Clearing a one-time charge sets `payment_status = 'cleared'` when the balance
   reaches zero and leaves the due date alone.

Reason:
An invoice is a single dated obligation, not a cycle. Forcing it into "Monthly
with the minimum set to the balance" loses the real due date and silently rolls
the due date forward on payment. Reusing `minimum_payment` for the instalment
avoids a parallel amount field and keeps the existing pay/cycle flow intact.

Status: Decided 2026-08-11. Implemented.


## ADR-049: Arrears — track how much is past due, not just that something is
Decision:
Overdue becomes a money figure. `src/lib/arrears.ts` exports `computeArrears`,
a pure function over a payable:
1. Walk forward from the item's current due date in billing-cycle steps until
   today. Every due date already passed is a missed cycle. The first (current)
   cycle counts only what is still owed on it (`cycle_paid_to_date` netted off);
   every later passed date counts the full cycle amount.
2. Add `opening_arrears` — a manual figure for money already past due before
   Hearthstone tracked the item. Cycles on or before `arrears_as_of` are skipped
   so the manual figure and the walk cannot double count.
3. One-time charges (ADR-048) stop after their single due date. Debts with a
   zero remaining balance report only their carry-in.
Bills and Debts both gain `opening_arrears` and `arrears_as_of` columns and a
"Past due carried in" block in their forms. `PastDueBadge` renders
"N cycles · $X past due" on Bills and Debts rows, and the Dashboard "Overdue"
section becomes "Past due", showing the arrears total and how many cycles behind
each item is.

Reason:
The previous signal was boolean (`isDateOverdue`) and only ever surfaced one
cycle's remaining amount, so a bill three months behind looked the same as one
a day late. Deriving missed cycles from the due date needs no new ledger rows,
and the manual carry-in covers items that were already behind on day one.

Status: Decided 2026-08-11. Implemented.

## ADR-050: Obligation avatars and tap-to-reveal budget detail
Decision:
1. Bills, Debts and Accounts render a shared `ObligationIcon`: linked
   institution logo → institution-type icon/colour → name-derived emoji. The
   institution name is no longer repeated as text on Accounts rows.
2. Budget surfaces (Dashboard "Budget vs actual", Spending) lead with a single
   bar/ring summary; the ADR-034 spending-vs-bills split and the edit controls
   are revealed on tap rather than printed on every row.
3. Add Transaction's category list renders the ADR-029 icon + colour, and an
   unrecognised description offers inline institution creation with a favicon
   guessed from the merchant name.

Reason:
The lists were text-dense on phones and the ADR-034 split lines dominated rows
that are usually scanned, not read. Logos identify an obligation faster than a
repeated institution name, and capturing merchants at entry time builds the data
needed for a later spending-by-institution view without a schema change.

Status: Decided 2026-08-11. Implemented.

## ADR-051: Stranded debt payments are detected by balance, not bookkeeping
Decision: A debt stops being flagged as "stranded" once its balance has already
come down by at least everything ever cleared against it, or once the debt row
was updated after the newest cleared ledger row.

Reason: The old check only looked at `cycle_paid_to_date`, so a payment repaired
by hand (balance corrected, cycle columns untouched) kept showing the repair
card forever.

Status: Decided 2026-08-11. Implemented.

## ADR-052: Invoice number field and auto-composed invoice names
Decision: Debts gain `invoice_number`. When the type is Invoice and the name has
not been typed by hand, the name auto-composes as "<Institution> - <Invoice
number>" and updates as either input changes. Typing in the name field (or
editing an existing debt) stops auto-naming permanently.

Reason: Invoices are identified by issuer + number; typing that twice is busywork,
but the name must still be freely editable.

Status: Decided 2026-08-11. Implemented.

## ADR-053: Transactions carry an institution (place)
Decision: `transactions.institution_id` records where money was spent. Add
Transaction suggests matching places as you type the description, one tap links
the entry, and an unknown place can still be saved inline (auto-favicon) and is
linked immediately. Writes tolerate the column being absent.

Reason: Groundwork for a "spending by place" view, captured at entry time without
slowing the quick-add flow.

Status: Decided 2026-08-11. Implemented (view pending).

## ADR-054: Income sources are cards with their own detail route
Decision: Each income source on the Paycheck Budget screen is a card linking to
`/app/income-source/$id`. The detail view shows this-year, all-time, and monthly
average income, the full pay-date history, an Edit form, and a full editor for
the ADR-047 deposit splits (fixed or remainder, per account, optional day
offset).

Reason: A paycheck that lands across checking, savings, HSA, and retirement
needs its splits described somewhere; the old read-only list gave no place to do
it and no view of what a source has actually paid.

Status: Decided 2026-08-11. Implemented.

## ADR-055: Income Source Deductions (Net/Gross Split)

Decision:
Add `income_source_deductions` (name, amount OR percent — exactly one — optional
`destination_account_id`, `is_pre_tax`). `income_sources`' existing amount field keeps
its current meaning (net); gross is computed as net + sum(deductions), never stored.
Marking a pay date received (ADR-047) posts the existing net splits AND one deposit
transaction per deduction that has a `destination_account_id` (cleared, same
`split_group_id` as the pay event, description "Deduction: <name>"). Deductions with no
destination account are reporting-only — no transaction.

Reason:
Matches the existing splits pattern (ADR-024/047) instead of inventing a second
mechanism. Reuses `split_group_id` so a deduction deposit groups with the rest of that
pay event in the ledger UI.

Schema:
```sql
create table income_source_deductions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  income_source_id uuid not null references income_sources(id) on delete cascade,
  name text not null,
  amount numeric(12,2),
  percent numeric(6,3),
  destination_account_id uuid references accounts(id),
  is_pre_tax boolean not null default false,
  created_at timestamptz not null default now(),
  check ((amount is not null and percent is null) or (amount is null and percent is not null))
);

alter table income_source_deductions enable row level security;
create policy "household access" on income_source_deductions for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));

grant select, insert, update, delete on income_source_deductions to authenticated;
grant all on income_source_deductions to service_role;
```

**Resolved 2026-08-11:** percent-type deductions compute against the income event's
`actual_amount` (net), not a derived gross figure. So: gross = net + Σ(flat amounts) +
Σ(percent × net). No gross figure is stored anywhere — it's computed for display only.

Status: Decided 2026-08-11. SQL run and verified. Ready to implement.

---

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

---

## ADR-057: Overdue-Aware Payment Allocation (Extends ADR-035, ADR-049)

Decision:
The pay dialog gains three amount presets: **Owed this cycle** (current
`cycle_amount_due − cycle_paid_to_date` behavior, unchanged), **Total due** (cycle +
live arrears total per `computeArrears`), and **Other amount**.

Allocation on a cleared payment, in order:
1. Credit the current cycle first (existing ADR-035 behavior, unchanged).
2. Any overflow beyond the current cycle reduces `opening_arrears` directly and
   advances `arrears_as_of` to the payment's date.

Reason:
ADR-049 already skips any cycle on/before `arrears_as_of` when walking missed cycles,
so reducing `opening_arrears` and bumping `arrears_as_of` on overflow is sufficient to
make `computeArrears` reflect the payment on the next render — no new columns, no
separate "arrears paid" ledger. For debts, an overflow payment already reduces
`remaining_balance` via existing cleared-payment logic (ADR-035); this ADR only adds
the `opening_arrears`/`arrears_as_of` update so the missed-cycle count also shrinks,
not just the balance.

**Flag for careful testing** (per project convention: this is the "worth debugging
carefully" category, like ADR-015's payoff math): verify a bill 3 cycles behind, paid
"Total due," correctly zeroes both `cycle_paid_to_date` state and the arrears walk —
i.e. `PastDueBadge` drops to 0 cycles, not just the dollar figure.

Status: Decided 2026-08-11. SQL run — no new columns to verify (reuses opening_arrears/arrears_as_of).

---

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

## ADR-059: Manual Bill/Debt Allocation in Pay Periods (Resolves ADR-024's Known Limitation)

Decision:
Extend `pay_period_allocations` with two new nullable columns, `bill_id` and
`debt_id`, alongside the existing `category_id`/`goal_id`. The existing
check constraint (exactly one of category_id/goal_id set, per ADR-039) is
replaced with one requiring exactly one of the four to be set — a row
allocates to a category, a goal, a bill, or a debt, never more than one.

The Paycheck Budget screen gains a way to manually plan an amount toward a
specific bill/debt for a specific pay period, independent of that item's
`next_due_date`. This is additive to, not a replacement for, the existing
automatic due-date bucketing (`obligationsInRange()`, ADR-024):

- **Auto-matched items** (today's behavior, unchanged): a bill/debt whose
  effective due date falls inside the period shows in "Due this period" —
  labeled as due.
- **Manually planned items** (new): any bill/debt with a
  `pay_period_allocations` row for this period shows in a second, clearly
  separate section — labeled "Planned," not "Due" — with the manually
  entered amount, regardless of what the due date says. An item can appear
  in both sections at once if it happens to be both due and separately
  planned; they are not deduplicated against each other, since "due" and
  "planned" answer different questions.

This does not change how due-date bucketing itself works for ordinary
bills — nothing about an unflagged bill's forecast changes. Only bills/debts
the household chooses to plan manually (via a `pay_period_allocations` row)
gain the second section.

Reason:
Some obligations don't have a predictable due-date-to-paycheck mapping —
most concretely, rent paid via a third-party split service (Flex) whose
per-paycheck split amount is decided after the fact and can't be derived
from a stored due date. ADR-024 already logged this as an open limitation
("no manual override for which paycheck pays this bill... revisit when
misassignment actually happens in practice"). It has now happened in
practice. Reusing `pay_period_allocations` (already the mechanism for
manually directing paycheck money toward a category or goal, per
ADR-024/039) for a bill/debt target is the same pattern a third time, not a
new concept — consistent with "reuse before create."

This intentionally does NOT attempt to auto-predict a split. The household
sets the planned amount by hand, per period, based on their own current
expectation (which may be "I don't know yet" — leave it blank, nothing
forces a value). The ledger — not this forecast — remains the source of
truth for what actually happened, via existing bill-linked transaction
filtering (Group 7).

Schema change:
```sql
alter table pay_period_allocations add column if not exists bill_id uuid references bills(id);
alter table pay_period_allocations add column if not exists debt_id uuid references debts(id);
```

The existing check constraint from ADR-039 needs to be replaced. Its exact
name is auto-generated and not recorded in this doc — **inspect it first**
before dropping anything:
```sql
select conname, pg_get_constraintdef(oid) from pg_constraint
where conrelid = 'pay_period_allocations'::regclass and contype = 'c';
```
Then drop that constraint by its real name and add:
```sql
alter table pay_period_allocations add constraint pay_period_allocations_exactly_one_target
  check (
    (category_id is not null)::int +
    (goal_id is not null)::int +
    (bill_id is not null)::int +
    (debt_id is not null)::int = 1
  );
```

Migration steps:
1. Run the inspection query, confirm the existing constraint name, then run
   the column additions + constraint swap in the Supabase SQL Editor.
2. `useSetAllocation()` (src/lib/income-hooks.ts or wherever it lives per
   ADR-039) gains `billId`/`debtId` parameters alongside `categoryId`/
   `goalId`, with the same "exactly one, reject both/neither client-side"
   guard already used for the category/goal case.
3. Paycheck Budget screen: add a "Plan a bill/debt payment" action — pick a
   bill or debt, enter a planned amount for this period. Shows as a new row
   in a "Planned" section, visually distinct from the existing "Due this
   period" section (different label/accent, not merged into one list).
4. No change to `obligationsInRange()` or the existing auto-matched due-date
   logic — this is purely additive.

Status: Decided 2026-08-12. Not yet implemented — SQL pending your review/run.

## ADR-060: Recurrence Projection for Forward-Looking Pay Periods

Decision:
Add a purely computed (no new schema, no new rows) recurrence-projection
function that extends `obligationsInRange()`'s reach beyond a bill/debt's
single stored `next_due_date`/`due_day`. For any pay period that is beyond
the item's current unpaid occurrence, the function walks forward by the
item's `billing_cycle` interval — reusing whatever existing cycle-advance
logic already computes the *next* due date when a cycle is cleared (find
and reuse that function; do not write a second date-math implementation) —
generating however many projected occurrences are needed to reach the last
period the household has an entered pay date for. Nothing is written to the
database; a projection exists only for the duration of rendering the
Paycheck Budget screen and is recalculated every time.

Projected occurrences appear in the same "Due this period" card as real
due items, but visually and textually distinguished — e.g. a "Projected"
badge or muted styling — so a household member can tell at a glance which
figures are confirmed-due versus estimated-from-recurrence. Projected
amounts DO count toward the period's total/left-to-allocate math (ADR-039),
since the entire point is to let the household plan against them; they are
simply labeled differently, not excluded from totals.

Projection horizon: exactly as far as the household's own entered future
pay dates reach — no fixed window, no projecting past the last pay date
currently in the system. Adding one more future pay date automatically
extends how far projections run; removing one contracts it. No
configuration needed.

Reason:
`obligationsInRange()` only ever knows a bill/debt's single next unpaid
occurrence — correct for arrears/current-cycle tracking (ADR-024/049), but
structurally blind to anything beyond it, confirmed by direct diagnosis:
the period 8/27→9/10 populates correctly, while 9/10→9/24 shows nothing
despite dozens of monthly-recurring bills that obviously recur into it.
This isn't a bug in the existing range comparison — it's a missing
capability (the app has no concept of a bill's *future* occurrences, only
its current one). Reusing the household's own entered pay dates as the
projection horizon (rather than a fixed lookahead window) means projections
never outrun what's actually plannable — there's no pay period to plan
against beyond the last entered pay date anyway.

This is intentionally separate from and complementary to ADR-059 (manual
per-period planning for cases like Flex/rent where the split truly isn't
determined by any due date at all). ADR-060 handles the ordinary case —
every recurring bill/debt's due date, projected forward. ADR-059 handles
the exceptional case — an amount that can't be derived from a due date no
matter how far you project it.

Non-goals:
- Does not change `next_due_date`/`due_day` or any stored data — purely a
  display-layer projection.
- Does not attempt to predict *variable*-amount bills' future amounts
  beyond repeating their current `amount`/default — no forecasting of
  amount drift, only date/recurrence.
- Does not affect arrears/`computeArrears` (ADR-049) — that logic is
  unchanged; this only extends how far into the future the *upcoming*
  side of the Paycheck Budget screen can see.

Implementation notes:
1. Find the existing function that advances a bill/debt's due date forward
   by one cycle (used when a payment clears a cycle) — reuse its interval
   math (monthly/biweekly/quarterly/bimonthly/annually/custom) rather than
   reimplementing billing_cycle logic a second time.
2. New function, e.g. `projectOccurrences(item, throughDate)`: starting
   from the item's current `next_due_date`/computed due date, repeatedly
   advance by one cycle, collecting each resulting date, until the date
   exceeds `throughDate` (the end of the last period with an entered pay
   date).
3. `obligationsInRange()` (or the Paycheck Budget screen's data assembly)
   calls this per bill/debt once, then buckets each real+projected
   occurrence into whichever period's range it falls in, same half-open
   `start <= d < end` comparison already in use.
4. UI: projected line items get a visual marker distinguishing them from
   real due items; total/left-to-allocate math includes both.

Status: Decided 2026-08-12. Not yet implemented.

---

