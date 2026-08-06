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
