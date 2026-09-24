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

**2026-08-27 addendum — expose `accounts.account_number` too:**
The account add/edit dialog gains an "Account / card number" text input bound to
`accounts.account_number` (nullable, stored as `null` when blank, not trimmed of
digits on write). Same rationale as the original ADR: the column already exists
(added 2026-07-28) and `accountLast4()` / `accountLabel()` (`src/lib/format.ts`)
already render only its last 4 digits (`•••1234`) in account pickers and pills —
there was just no way to enter it. The Accounts screen (`src/routes/app.accounts.tsx`)
also now shows `···1234` after the account name. Balance logic unchanged. An
account still represents both the account and its card; no separate `cards`
table (see `docs/SCRATCHPAD.md` "Things to work on"). Implemented 2026-08-27 in
`src/components/AccountDialog.tsx` + `src/routes/app.accounts.tsx`.

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
falling back to a gray tag icon when null). CATEGORY_ICONS set expanded
2026-08-17 (30 → 54 options), then expanded again 2026-08-17 (54 → 77
options) — same picker component both times, no schema change.


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

**2026-08-18 addendum — what the hero "set aside this pay period" figure means:**
`periodTotals.total` (`src/routes/app.index.tsx`) = sum, over
`obligationsInRange(bills, debts, period.start, period.end)`
(`src/lib/paycheck-budget.ts`), of each bill's `cycle_amount_due ?? amount` plus each
debt's `minimum_payment`, for bills/debts due inside the current period — excluding
debts flagged `is_paycheck_deduction` and any already `date_paid_off`. `period` runs
from the primary income source's most recent past-or-today paycheck date up to its
next scheduled one (or 14 days out with none scheduled), falling back to the
calendar month when there's no primary income source. This is a forward-looking
target — bills + minimum debt payments due before the next paycheck — not money
already moved into savings, despite the "set aside" wording. Documented here for
tooltip copy; no behavior change.


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

**Addendum (2026-08-19):** `deriveCycleInfo()` was purely ledger-transaction-derived —
zero awareness of `debts.remaining_balance`/`date_paid_off` — so a debt paid off any way
other than through Hearthstone's own Submit/Clear flow (balance corrected by hand, paid
off before tracking started, etc.) read UNPAID forever on the Everything screen, even
though the Debts screen's own `isPaidOff` (`app.debts.tsx:149`, `remaining_balance <= 0`)
correctly showed it as paid off. Fixed by overriding the derived state to CLEARED (and
`remaining` to 0) whenever `p.kind === 'debt'` and `remaining_balance <= 0`, after the
normal ledger-based derivation runs — matches the Debts screen's own definition instead of
introducing a third one. Bills have no equivalent balance field, so this is debt-only.
Distinct from ADR-047/ADR-072-era work: this doesn't touch `obligationsInRange()`'s
`date_paid_off` check (the Aurora Audiology fix) — a different code path entirely.

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

### Addendum (2026-08-20): bill-side repair tool, and closing the Transactions-edit hole

A second cause of the same symptom was found on bills: the generic Transaction edit
dialog (Transactions screen) let a linked row's `amount`/`status` be changed via plain
`useUpsertTransaction()`, bypassing `applyClearedPayment()` entirely. Flipping a linked
transaction from pending to cleared there (or editing its amount) left the ledger showing
money cleared while `bills.cycle_paid_to_date` never moved — same stranded-payment
symptom as the original ADR-037 bug, different root cause (a UI gap, not a write-order
race).

Fix:
1. `TransactionDetailDialog`'s edit form now disables `amount` and `status` whenever the
   transaction is linked (`linked_bill_id`/`linked_debt_id` set), with a note pointing to
   the bill/debt's own Pay actions or Reverse. Date/description/account/category/place
   stay editable — only the two fields that drive cycle math are locked.
2. `findStrandedBillPayments()` / `StrandedBillRepair` (`src/components/StrandedBillRepair.tsx`)
   mirrors the debt-side repair scan for bills, mounted on the Bills screen. It flags a
   bill whose current-cycle cleared ledger sum exceeds `cycle_paid_to_date` (not just
   stuck at exactly 0, since a partial edit can desync it to any value) and offers the
   same delete-and-redo repair.

Extends: ADR-037.

Status: Decided 2026-08-20. Implemented 2026-08-20.

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

2026-08-26 addendum — warn on a repeat same-month Set Aside:
The "no guard" open item above is resolved as warn-and-allow, not a hard block.
Before writing the transfer pair, `SetAsideAction` checks for an existing cleared
credit transaction with `linked_goal_id` = this envelope whose description begins
"Set aside: <bill name>" dated in the current calendar month. If one exists, a
confirm() warns ("You already set aside $X for <bill> this month on <date> — set
aside again anyway?") and proceeds only on OK. A top-up or correction is legitimate,
so the action is never prevented — just made deliberate. No schema change.
Implemented 2026-08-26.

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

### ADR-041 addendum (2026-08-27): "Start new month" is not a lock

"Start new month" (`useStartNewSpendingMonth`) only inserts zeroed
`spending_actuals` rows for the *next* month. It never freezes, locks, or
overrides any prior-month row — prior months stay ledger-derived and every cell
stays editable (subject only to the per-cell `is_manual_override` above, which a
human sets and can revert). UI copy must not describe a rolled-past month as
"locked". The toast now reads "Now budgeting <next> · earlier months stay
editable"; the override confirm dialog says the override is for that month only
and is reversible via the pencil control. No behaviour change — copy only.



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

### ADR-049 addendum (2026-08-27): "past due" display is prior-months-only; monthly-debt one-month lookback

Two problems surfaced when the calendar rolls into a new month:

1. **Double-count on the Dashboard.** `computeArrears().amountOverdue` folds the
   current cycle's own remainder into the total once its due date has passed —
   correct as a "total to get fully current" / payoff figure, but the current
   cycle *also* shows under "Still owed this period" (ADR-080), so the Dashboard
   was adding the same cycle twice (up to ~$2–3× the real figure for an item a
   month or more behind). New `priorArrearsSummary(p)` runs the same walk with
   its reference date clamped to the **first of the current calendar month**, so
   it returns arrears from cycles that belong to a *prior* month only. The
   Dashboard "Past due" card and `PastDueBadge` now use it; `computeArrears`
   itself is unchanged and stays the payoff/repair figure used on the detail
   panel and by all payment math. An item still appears in both "Past due" and
   "Still owed this period" — the two are meant to be additive (a missed August
   cycle + a live September cycle = two months genuinely owed). Residual edge:
   for a mid-month due date viewed early in the following month, before that
   month's due date and outside the current pay period, the prior cycle can
   still show in both lists briefly; it self-corrects once the due date passes,
   and the over-count is far smaller than before.

2. **Monthly-debt arrears vanished.** `debtDueDate()` recomputes `due_day` inside
   the current calendar month and never looks back, so a monthly debt's missed
   prior-month cycle left no due-date signal and the walk never counted it.
   `arrearsWalkStart()` (internal to `arrears.ts`) now steps a monthly debt's
   walk start back one month when this month's due day is still ahead and the
   current cycle isn't settled (`payment_status='cleared'` or
   `cycle_paid_to_date >= minimum_payment`). Bills and non-monthly debts are
   untouched — their `next_due_date` is a real stored pointer.
   **Known limit:** recovers at most ONE missed prior month (the debt row has no
   per-cycle history). A deeper miss needs `computeArrears` to read the linked
   ledger — tracked in `docs/TODO.md`.

No schema change. Cross-referenced from ADR-080.

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

Status: Decided 2026-08-11. Implemented (view pending). 2026-08-17: manual/
generic transactions (no linked_bill_id/linked_debt_id, no "Fee: " description)
title themselves from place instead of a generic "Transaction" fallback —
see ADR-063 addendum.

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

Status: Decided 2026-08-12. Implemented 2026-08-13 (`projectOccurrences()` + `obligationsInRange(..., projectThrough)` in `src/lib/paycheck-budget.ts`; "Projected" badge on the Paycheck Budget screen).

---

## ADR-061: Color Theme System

Decision:
Add seven selectable UI color themes: `standard` (current colors, default),
`halo`, `hellokitty`, `purple_dark`, `purple_pastel`, `cyber_neon`, `cyber_stealth`.
Theme is a per-user preference, not household-shared data — added as:

```sql
alter table household_members
  add column theme text not null default 'standard'
  check (theme in ('standard', 'halo', 'hellokitty', 'purple_dark',
                    'purple_pastel', 'cyber_neon', 'cyber_stealth'));
```

Mechanism: a `data-theme="<value>"` attribute on `<html>`, set by a new
`ThemeProvider` (`src/lib/theme.tsx`) that reads the current member's `theme` on
load and exposes `useTheme()`/`useSetTheme()`. Each non-standard theme is a CSS
block in `src/styles.css` overriding the existing token set already established
in the Phase 6.6 visual restyle (`--brand`, `--gradient-brand`, `--shadow-card`,
`--item-1..6`, `--background`, and any other `:root` variables in current use) —
no new variable names, no component changes required. `useSetTheme()` writes to
`household_members.theme` via a mutation hook (same shape as `useSetExportFormat`,
ADR-028). Settings screen (`/app/settings`) gets a "Theme" section with a
swatch/preview button per theme, applying immediately on selection with no reload.

v1 is colors only — fonts and icon packs are explicitly deferred to a future ADR.

Amendment (2026-08-14): the column migration alone leaves the picker inert.
`household_members` also needs an UPDATE policy for the member's own row
(`user_id = auth.uid()`) plus `grant update ... to authenticated` — see
`docs/SCHEMA.md`. Without it PostgREST returns success with zero rows updated,
so the save toast fires while nothing persists. `useSetTheme()` now selects the
affected rows and throws when none come back.

Reason:
Household members wanted personalization beyond light/dark, including playful
themes (Halo, Hello Kitty) and two variants each of Purple and Cyber. Since the
app's visual system already runs entirely on CSS custom properties (Phase 6.6),
theming is additive — no component touches color literals directly, so a new
theme is a CSS block plus one column, not a rearchitecture. Per-user rather than
per-household storage was chosen because this is a personal display preference,
unlike `export_format` (ADR-028), which affects a shared, printable artifact both
users see identically.

Status: Decided 2026-08-14. Implemented 2026-08-14 (household_members.theme
column + check constraint written but not yet run in Supabase — see
docs/TODO.md; src/lib/theme.tsx ThemeProvider/useTheme/useSetTheme; six
[data-theme="..."] override blocks in src/styles.css; Settings screen Theme
section with a swatch button per theme).

## ADR-062: Manual Transactions Default to Pending, Not Cleared

Decision:
The Add Transaction dialog's default `status` changes from `'cleared'` to
`'pending'`. The status toggle remains user-editable at entry time. This
applies only to the plain Add Transaction flow — bill/debt payment
submission (ADR-035/036/046), income deposits (ADR-047/055), transfers and
advances (ADR-056) keep their existing statuses (pending-then-clear or
cleared-on-write, per their own ADRs), unchanged.

Reason:
Phase 3.5 established pending/cleared as a real state (spendable vs. current
balance), but the Add Transaction dialog still defaulted new rows to
cleared, silently skipping the pending step for manually-entered spending —
the most common entry path. Defaulting to pending makes the manual flow
match the behavior every other write path in the app already has, and keeps
spendable balance accurate the moment a transaction is logged rather than
whenever it's later confirmed against the bank.

Status: Decided 2026-08-14. Implemented 2026-08-14.

---

## ADR-063: Place and Description Are Separate Fields (Amends ADR-053)

Decision:
Add Transaction gains two distinct fields where ADR-053 used one:
- **Place**: the existing institution search/inline-create picker
  (autocomplete-as-you-type, one-tap link, inline "+ Add new institution"),
  unchanged in behavior — only moved off the Description field.
- **Description**: a plain free-text field for an optional note, independent
  of place matching.

`transactions.institution_id` and `transactions.description` keep their
current meaning and storage — this is a UI field-mapping change only, no
schema change, no change to how institution matching/creation works.

Reason:
ADR-053 tied place-matching to the Description field to avoid slowing quick
entry, but in practice it prevents adding any actual note when a place is
also being set, and conflates two different kinds of information. Splitting
them costs one extra field, not new matching logic.

Status: Decided 2026-08-14. Implemented 2026-08-14. 2026-08-17 addendum: the
Transactions list row, its detail dialog title, and Accounts' Recent Activity
row now title a manual/generic transaction (no linked_bill_id/linked_debt_id,
no "Fee: " description) from its place — institution_id set + empty
description → place alone; institution_id set + non-empty description →
"<Place> · <Description>" with the description rendered subdued
(`text-muted-foreground`, italic, smaller); institution_id null → unchanged
(`description || "Transaction"`). Fee/Bill payment/Debt payment titles are
untouched — those descriptions already never fall back and are excluded by
the linked-id/"Fee: " gate. New shared `TransactionTitle` component in
`src/components/TransactionTitle.tsx`, used by
`src/routes/app.transactions.tsx` and `src/routes/app.accounts.tsx`. UI-only,
no schema change.

---

## ADR-064: Transfers Gain a Category Picker (Amends ADR-056)

Decision:
Add Transaction, Transfer mode, gains a category picker on the transfer as a
whole (one category applies to both the from- and to-account rows of the
pair — a transfer is one event, not two categorizable movements). Uses the
same visual style as other dropdowns in the app (larger, icon-based,
matching the Bill/Debt Type and Institution pickers per the ADR-054
shared-dialog visual pass) — not a plain `<select>`. `category_id` is
optional on transfers, consistent with how it's optional elsewhere.

Reason:
ADR-056 omitted categories from transfers on the assumption a transfer is
just money moving between the household's own accounts, not spending. In
practice households still want to tag transfers (e.g. "Savings goal," "Debt
payoff") for reporting alongside categorized spending, and every other
transaction type already has a categorized, icon-styled picker — leaving
transfers as the one uncategorized, unstyled exception was inconsistent
rather than intentional.

Status: Decided 2026-08-14. Implemented 2026-08-14.

## ADR-065: Bill/Debt Payment and Fee Transactions Default institution_id (Extends ADR-046, ADR-053)

Decision:
When writing a bill/debt payment transaction (ADR-035/036/037) or its paired fee
transaction (ADR-046), institution_id is set from the linked bill's or debt's own
institution_id (ADR-006), same moment the write already happens — no extra user
step. Manual Add Transaction entry (ADR-053) is unchanged: place still must be
picked/created there, since a plain transaction has no bill/debt to inherit from.

This is a default only, not a lock — the user can still change or clear the place
afterward via TransactionDetail edit (same as any other transaction).

Reason:
Bills and debts already know their institution; failing to carry it onto their
payment/fee transactions was an oversight from before institution_id existed on
transactions, not an intentional gap. It also means every bill/debt payment and
fee transaction was showing up in the "Fix Places" repair screen, which should
only be surfacing genuinely untagged manual spending.

Status: Decided 2026-08-14. Implemented 2026-08-14 (institution_id set from
the linked bill/debt in useMarkSubmitted, useMarkCleared's direct-clear
branch, and insertFeeTransaction, all in src/lib/payments.ts; one-time
backfill SQL written for existing null institution_id rows, pending manual
run in Supabase — see docs/TODO.md).

## ADR-066: Advance-Type Debts Reactivate on Re-Advance Instead of Staying "Paid Off"

Decision:
For debts where debt_type = 'advance', recording a new advance
(debt_adjustments row, adjustment_type='advance', affects_balance=true) via
the existing advance write path checks the target debt's date_paid_off. If
set, the same write clears date_paid_off and un-hides the debt — same debt
id, same history, continuing forward. No new debt record is created per
advance cycle. This check lives in the write path itself (not a display-time
inference), since it's a real state change worth persisting.

Other debt types keep today's behavior unchanged: reaching
remaining_balance = 0 stamps date_paid_off permanently, debt stays hidden.

debt_type becomes an enforced (checked) column instead of free text, stored
lowercase in the database — consistent with the existing account_type
convention (`account_type is always stored lowercase`). The app displays it
capitalized (title case) at render time, same pattern already used
elsewhere for lowercase-stored/display-formatted fields.

Reason:
Revolving advance products (MoneyLion Instacash and similar) routinely hit
$0 and get re-advanced days later as normal use, not as a new debt.
Enforcing debt_type gives the reactivation check something reliable to key
off — free text risked a casing/spelling mismatch (e.g. "Advance" vs
"advance") silently skipping reactivation.

Scope note: doesn't change ADR-056's advance-write mechanism itself or
ADR-035/036's payment/cycle logic — only adds the reactivation branch to the
existing advance write, plus the debt_type constraint.

Status: Decided 2026-08-14. Implemented 2026-08-17.

**2026-09-01 addendum — non-Advance payoff dates are a stored invariant:**
Every write that changes a non-Advance debt's `remaining_balance` also keeps
`date_paid_off` synchronized: a balance at or below $0.005 has a payoff date,
and a balance above that threshold clears it. Payment and historical-payment
writes use the transaction date; adjustments use the adjustment date; other
writes fall back to the action date. Advance debts remain exempt because a zero
balance is their normal reusable state and ADR-066 owns their reactivation.

The database trigger `trg_sync_debt_date_paid_off` enforces the same invariant,
preventing imports or future write paths from creating another zero-balance
non-Advance debt without a payoff date. The 2026-09-01 migration repairs
existing rows using the latest linked cleared transaction date, falling back to
the migration date when no payment history exists.

Reason:
Everything correctly filtered on the stored payoff date, but legacy/imported
and adjustment-driven zero balances could lack that date and therefore remain
visible forever. Fixing the persisted lifecycle state, rather than adding a
display-only inference, keeps all aggregates and filters consistent.

Status: Decided 2026-09-01. Implemented in code; database migration pending
manual execution (`scripts/migrations/2026-09-01-enforce-debt-payoff-date.sql`).

## ADR-067: Parent Category Becomes a Dropdown Over Existing Values (Amends ADR-011)

Decision:
The Categories screen's Parent Category field becomes a dropdown/combobox
sourced from the household's own distinct existing `categories.parent_category`
values, with an inline "+ Add new" option for a genuinely new parent label.
`categories.parent_category` remains a plain text column — no
`parent_categories` table, no FK, no schema change. This only changes the
input widget from free text to constrained-choice-plus-create.

Reason:
ADR-011 kept parent_category as free text and leaned on a pre-insert
validation query to catch drift (e.g. "Gifts/Holidays" vs "Gifts &
Holidays"). That validation only runs at CSV import time, not during normal
in-app editing — so drift was always possible from the Categories screen
itself. A dropdown over existing values closes that gap directly, without
the FK/migration ADR-011 decided wasn't yet justified.

Status: Decided 2026-08-17. Implemented 2026-08-17 (Categories screen Parent
Category field: Select over distinct existing `parent_category` values, "None",
and inline "+ Add new" text entry).


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


## ADR-069: Ad-Hoc Income Category

Decision:
Extend `categories.domain` from `'bill' | 'debt' | 'spending'` to a 4th value, `'income'`.
Scope is ad-hoc income only — side income, reimbursements, credits, gifts received — fully
separate from `income_sources` and the structured pay-period engine (ADR-055 and related),
which this does not touch.

Four new categories created under `domain = 'income'`: **Income, Credit, Refund, Gift**.

Before this ships, audit existing domain-filtered queries to confirm they're safe with a
4th value — Dashboard category grid totals, `spending_budgets`/`spending_actuals` (must
explicitly filter `domain = 'spending'` rather than assuming "not bill/debt"), and the
category picker in Add Transaction.

Backfill: existing transactions that are positive-amount and currently miscategorized
get re-tagged into the matching new income category. Source category IDs (e.g. the
existing "Gifts" category) need to be confirmed live via Supabase SQL Editor before the
backfill script is written — not assumed from documentation.

Reason:
A 4th domain value keeps one source of truth for category type instead of adding a
parallel flag. Scoping this to ad-hoc income only, and explicitly not touching
`income_sources`, avoids collision with ADR-055's gross/net deduction logic.

Schema:
```sql
alter table categories drop constraint categories_domain_check;
alter table categories add constraint categories_domain_check
  check (domain in ('bill','debt','spending','income'));

insert into categories (household_id, name, domain) values
  ('<household_id>', 'Income', 'income'),
  ('<household_id>', 'Credit', 'income'),
  ('<household_id>', 'Refund', 'income'),
  ('<household_id>', 'Gift', 'income');
```

Status: Decided 2026-08-18. Not yet implemented — domain-filtered query audit and backfill
source-category confirmation are prerequisites before running the SQL above.

## ADR-069: Ad-Hoc Income Category (continued — required code changes)

Audit finding (2026-08-18): No domain filtering exists anywhere in the frontend today.
`useCategories()`, `useSpendingBudgets()`, `useSpendingActuals()` filter only on
`household_id`. Dashboard budget grid, Spending screen, `buildActualResolver()`, and the
Add Transaction category picker are all driven purely by presence of a `spending_budgets`
row or a transaction's `category_id` — none check `domain`. Introducing `domain = 'income'`
without code changes would let a `spending_budgets` row exist against "Gift" or "Credit"
and surface it in the Dashboard/Spending grids identically to a real spending category, and
would offer income categories in the spending-entry picker.

Required changes (Lovable-ready prompt, reference ADR-069, do not create a new ADR):

1. `useCategories()` (src/lib/data-hooks.ts) — add an optional `domain` filter param so
   callers can request `domain = 'spending'` explicitly rather than relying on absence of
   a filter.
2. Add Transaction category picker (src/components/AddTransactionFab.tsx:142-145) — filter
   `sortedCategories` by `domain === 'spending'` for expense entries; income categories
   should only appear when the transaction being entered is income (positive amount /
   explicit "Income" entry mode — exact UX for how a user signals "this is income" needs a
   decision, see open question below).
3. Dashboard budget grid (src/routes/app.index.tsx:193-236) and Spending screen
   (src/routes/app.spending.tsx:154-156) — both currently iterate `spending_budgets` rows
   unconditionally. Add a join/filter so only rows where the linked category has
   `domain = 'spending'` are included. This also implies: creating a `spending_budgets` row
   against an income category should be prevented at the source, not just filtered at
   display time — otherwise stray budget rows accumulate silently.
4. `buildActualResolver()` / `billsBudgetedByCategory()` (src/lib/spending-actuals.ts) —
   currently filters only by `amount < 0`. Should also exclude `domain = 'income'`
   categories explicitly rather than relying on the sign check as an incidental filter.

Open question (needs your decision before Lovable prompt is finalized): how does a user
signal "this transaction is income" in Add Transaction — a separate entry mode/toggle, or
just picking an income-domain category and the amount sign is inferred? This affects #2
directly.

Reason:
The domain column alone does nothing without consumers respecting it — this was flagged
as a prerequisite in the original ADR-069 draft and the audit confirms it's required, not
optional, before the schema migration ships.

Status: Audit complete 2026-08-18. Code changes not yet implemented. Schema migration
(domain constraint + 4 category inserts) should not run until Lovable has this prompt
staffed, to avoid a window where income categories exist but nothing respects them.

## ADR-070: Payment Reversal Tool

Decision:
A "Reverse" action on any cleared transaction with linked_bill_id or linked_debt_id set,
shown in the "Recent transactions" section on Bill/Debt detail (same location as the
existing delete button, ADR-037). Only offered when status = 'cleared', a link is set, and
amount < 0 (an actual payment, not a fee or manual entry).

Confirming a reversal, in order:
1. Update the payable BEFORE writing the reversal row (payable-first pattern, ADR-037):
   - Bills: cycle_paid_to_date = greatest(0, cycle_paid_to_date - abs(original.amount)).
     If the result is less than (cycle_amount_due ?? amount), also set payment_status = 'unpaid'.
   - Debts: remaining_balance += abs(original.amount); cycle_paid_to_date =
     greatest(0, cycle_paid_to_date - abs(original.amount)); same payment_status reset rule;
     if date_paid_off was set, clear it (reactivation, mirrors ADR-066).
2. Insert a new transaction: same account, amount = -original.amount (sign-flipped, money
   returns), status = 'cleared', same linked_bill_id/linked_debt_id, description
   "Reversed: <bill/debt name> payment", transaction_date = user-supplied date (default today).

No schema change — reuses the existing unlinked/linked transaction pattern (same shape as
the fee mechanism, ADR-046).

Reason:
ADR-008 established that Undo is for accidental same-session clicks only — a genuinely
bounced/returned payment is real money movement that reversed and needs its own auditable
correcting transaction, not a rollback. The greatest(0, ...) clamp on cycle_paid_to_date
means the same code path is correct whether or not the bill/debt's cycle already rolled
forward past the bounced payment: if it already rolled (cycle_paid_to_date reset to 0), the
subtraction is a no-op and only the account-balance correction applies; if it hasn't rolled
yet, the subtraction actually reopens the cycle. No "which case are we in" branch needed.

Risk (accepted): reversing a stale, non-most-recent payment on a bill/debt that has since
had further cycles is allowed but will read confusingly in the ledger. Not blocked — flagged
in code as a comment.

Status: Decided 2026-08-18. Not yet implemented.

## ADR-071: Manually Planned Bill/Debt Rows Excluded From Obligations Total (Amends ADR-059)

Decision:
When a bill/debt has one or more pay_period_allocations rows (bill_id/debt_id set)
for a given pay period, its auto-matched due-date amount is excluded from that
period's obligations total feeding Left-to-allocate math — the Planned row(s)
already represent the real expected payment for this item this period, so
counting both double-subtracts the same obligation.

The "Due this period" section still displays the item (ADR-059's visual
separation is unchanged) — a household member can still see "this is
technically due by the calendar," it just no longer contributes twice to the
bottom-line math. Only the totals calculation changes.

Applies per-item, not per-bill-globally: if a bill has no planned row for a
given period, it's counted from Due as today. If it has one, only the
Planned figure counts.

Reason:
ADR-059 intentionally didn't deduplicate the two sections since "due" and
"planned" answer different questions — but that reasoning covered the
*display*, not the *totals math*. Left-to-allocate double-subtracting the
same rent payment through both the auto-match and the manual plan is a
straightforward math bug the visual-separation reasoning never addressed.

Status: Decided 2026-08-18. Implemented 2026-08-19 — new
`obligationsTotalExcludingPlanned()` (`src/lib/paycheck-budget.ts`), wired
into `PeriodBudget`'s `obligationsTotal` (`src/routes/app.paycheck.tsx`) via
a `plannedKeys` set built from this period's `pay_period_allocations` rows.
`obligations` (the "Due this period" list) and `planned`/`plannedTotal` are
untouched — only the aggregate total feeding Left-to-allocate and the
"Obligations total" footer changed.


## ADR-072: Optional Fee Amount on Planned Bill/Debt Allocations

Decision:
pay_period_allocations gains a nullable fee_amount numeric column, used only
when bill_id or debt_id is set. The existing amount column keeps its current
meaning — the total planned outflow for that item this period (e.g. $1,111) —
unchanged, so Left-to-allocate math (ADR-071) needs no changes. fee_amount is
purely a display breakdown: the Planned row shows "$1,111 ($1,100 rent + $11
fee)" instead of just "$1,111," letting the household label what part of a
planned payment is principal vs. fee.

This does not enforce or reconcile against the real payment later — when the
actual bill/debt payment happens through pay-flow.tsx's existing fee field
(ADR-046), that's a separate, independent write. The Planned row's fee_amount
is a forecast label, not a linked source of truth; if the real payment comes
in different, the Planned figure just becomes stale like any other forecast
until edited.

Reason:
Flex-split rent payments bundle a real fee into the total each installment
(ADR-059's motivating example). Without a way to note that split, the Planned
total looks like a large, unexplained round-up over the base bill amount.
Reusing the amount-vs-fee separation already established by ADR-046, rather
than inventing new terminology, keeps the concept consistent across the app.

Schema:
```sql
alter table pay_period_allocations add column if not exists fee_amount numeric(12,2);
```

Status: Decided 2026-08-18. App side implemented 2026-08-19 (`PayPeriodAllocation.fee_amount`,
`useSetAllocation`'s `feeAmount` arg, `PlanPaymentDialog`'s optional Fee amount field, Planned
row's "$total ($base + $fee fee)" display) — pending the `alter table` + `notify pgrst,
'reload schema'` being run manually in Supabase SQL Editor.

## ADR-073: Monthly Summary Card — Trailing Average vs. Budget, Combined Bills+Debts+Spending

Decision:
A new Dashboard card ("Monthly summary"), placed after "Past due" and before the net worth
trend chart. Per parent-category group (same grouping as the existing "Budget vs actual ·
this month" card), combines bills + debts + spending into one actual-so-far figure for the
current calendar month, and compares it against two expected figures shown side by side:

1. The existing manual budget target — `spending_budgets` + bills' monthly-equivalent load
   (`billsBudgetedByCategory`, unchanged) + a **new** `debtsBudgetedByCategory()`, which
   mirrors the bills version using `minimum_payment` in place of `amount`. Paycheck-deducted
   debts (`isPaycheckDeducted`, ADR-032) are excluded, matching how they're excluded from
   every other spendable-cash obligation total in the app.
2. A trailing 6-calendar-month actual average, same combined bills+debts+spending basis, over
   the 6 full calendar months immediately before the current one — the current (incomplete)
   month is never included in its own average.

Ledger-derived actuals reuse `buildActualResolver`'s pattern (category_id, falling back to
the linked bill's/debt's category) but add a `linked_debt_id` bucket alongside the existing
`linked_bill_id` one. Transactions linked to a paycheck-deducted debt are excluded entirely
(not counted as spending either), for the same reason as (1). This is a pure display
computation — never written back to `spending_budgets`, `pay_period_allocations`, or any
existing obligations/budget calculation. The existing "Budget vs actual · this month" card is
untouched.

Reason:
The household budgets per pay period (ADR-024/034/039) since bills/debts land on their own
due dates, not evenly across a calendar month — but that makes "am I spending more than usual
this month" hard to eyeball. A trailing average grounds "usual" in the household's own real
history instead of relying solely on a manually maintained target, while keeping the existing
target-based card intact. Separately, `billsBudgetedByCategory` never included debts, so a
category with only a debt minimum payment (no bill) looked emptier than its real monthly
load — extending the same monthly-equivalent pattern to debts fixes that for this card
without touching the existing card's behavior.

Schema: None — pure client-side computation over existing tables.

Status: Decided 2026-08-19. Implemented 2026-08-19.

## ADR-074: Usual Payment Account on Bills/Debts (Account Grouping)

Decision:
Add nullable `usual_payment_account_id uuid references accounts(id)` to both `bills` and
`debts`. A manual picker on each item's edit form lets the household record which account a
bill/debt is normally paid from. When the field is unset, the form defaults it once (not
resynced afterward) from the most recent transaction linked to that bill/debt
(`linked_bill_id`/`linked_debt_id`) if one exists — otherwise it stays null until set by hand.
Powers a new "Group: Account" mode in Paycheck Budget's "Due this period" toggle (alongside
the Due Date default and the Category mode shipped under ADR-073's work), showing subtotals
per account so the household can see how much needs to be in each account to cover what's due.

Reason:
Neither bills nor debts store any link to "the account this usually gets paid from" —
`institution_id` records the payee/merchant, not the household's own paying account. A manual
field beats trying to infer it fresh on every render from ledger history (unreliable/empty for
items never paid yet), while still saving a first guess from history so existing items with
payment history aren't blank by default.

Schema:
```sql
alter table bills add column usual_payment_account_id uuid references accounts(id);
alter table debts add column usual_payment_account_id uuid references accounts(id);
```

Migration steps:
1. Run the SQL above (Supabase SQL Editor, no CLI), then `notify pgrst, 'reload schema';`.
2. Backfill existing bills/debts that have payment history, one-time script:
   ```sql
   update bills b set usual_payment_account_id = (
     select t.account_id from transactions t
     where t.linked_bill_id = b.id order by t.transaction_date desc limit 1
   ) where b.usual_payment_account_id is null;

   update debts d set usual_payment_account_id = (
     select t.account_id from transactions t
     where t.linked_debt_id = d.id order by t.transaction_date desc limit 1
   ) where d.usual_payment_account_id is null;
   ```
3. Add the field to the Bill/Debt edit forms (manual picker), defaulting new/unset items to
   the most recent linked-payment account when one resolves.
4. Add "Group: Account" as a third option in Paycheck Budget's obligations toggle, with an
   `obligationsByAccount` memo mirroring `obligationsByCategory` (ADR-073-adjacent work).

Status: Decided 2026-08-19. Not yet implemented — pending sign-off before the SQL above runs.

## ADR-075: Persisted Cycle-Resolution Tag for Late Payments

Decision:
Add `transactions.resolved_cycle_due_date` (date, nullable). When `applyClearedPayment`
resolves a bill/debt cycle (the payment meets or exceeds the cycle target and the due
date rolls forward), it tags every cleared, linked, still-untagged transaction for that
payable with the due date that just resolved — not just the transaction that tipped it
over, but any earlier partial payments still sitting untagged from the same cycle. The
caller writing the resolving transaction itself (`useMarkCleared`'s two clear paths)
tags that row too, using the resolved due date `applyClearedPayment` now returns.
`deriveCycleInfo` (`ledger-state.ts`) excludes any transaction tagged with a
`resolved_cycle_due_date` earlier than the payable's current due date from the "current
cycle" window, regardless of its raw `transaction_date`.

Reason:
`deriveCycleInfo` infers which cycle a linked transaction belongs to purely from date
windows relative to the payable's current due date. That's ambiguous for a LATE payment
(paid after the due date it's resolving): its date falls inside the same range the
next, freshly-rolled cycle also uses, so the app misattributes it — showing the new
cycle as already "cleared" with a "Reset this cycle" action, when nothing has actually
been paid toward it, until the new due date itself passes and the stale window ages out
(surfaced 2026-08-20 on the Peacock bill). Two heuristic date-only fixes were tried and
rejected: narrowing the window breaks bills paid in full slightly early, and using the
payable's `updated_at` as a cutoff breaks ordinary partial payments, since every credit
write bumps `updated_at` past that same transaction's own `created_at`. Tagging is the
only way to record intent unambiguously without replaying full ledger history. Existing
(untagged) transactions keep today's date-window behavior unchanged — the fix is
forward-only, no backfill required.

Scope note: this only fixes the ledger-derived cycle *state badge*. It does not touch
`computeArrears`/`opening_arrears`/`arrears_as_of` (the separate, date-only "X cycles
past due" math) or the payment-allocation rules in ADR-057 — a bill/debt overdue by
multiple cycles still resolves one cycle's due-date advance per payment, with the
overflow handled entirely by the existing arrears mechanism, unchanged.

Extends: ADR-036.

Status: Decided 2026-08-20. Implemented 2026-08-20. SQL run 2026-08-21 (verified live:
`transactions.resolved_cycle_due_date` exists, nullable date).

## ADR-076: Arrears-Only Payments and Generalized Arrears Reduction (Extends ADR-049, ADR-057)

Decision:
1. New `applyArrearsPayment(p: Payable, amount: number, date: string, accountId: string)`
in `payments.ts`. Caps `amount` at `computeArrears(p).amountOverdue` (mirrors ADR-057's
cap pattern). Writes a cleared, linked transaction for the amount/date/account, tagged
`resolved_cycle_due_date` (ADR-075) with `arrears.oldestMissedDate ?? ` the cycle's own
open-start date — so it's excluded from the current cycle's ledger-derived window and
never shows up as if it paid the current cycle. Never touches `cycle_paid_to_date`.
2. Consolidates the payable's `opening_arrears`/`arrears_as_of` on every arrears-directed
credit (this new action AND the existing ADR-057 overflow-on-clear path):
`new_opening_arrears = max(0, computeArrears(p).amountOverdue - amountCredited)`,
`arrears_as_of = today`, regardless of whether `opening_arrears` was already > 0. This
replaces ADR-057's `openingArrears > 0` gate, which silently no-oped whenever arrears
came entirely from the live missed-cycle walk rather than a manual carry-in figure.
3. New "Log arrears payment" UI action (PayActions-adjacent, shown only when
`computeArrears().amountOverdue > 0`): prompts amount (default = arrears total, capped),
backdatable date, account. Usable repeatedly — each call is an independent, separately
dated ledger entry, so it doubles as bulk historical-payment entry.

Reason:
Bills/debts overdue by missed cycles (not manual carry-in) had no way to be paid down
independently of the current cycle — every payment credited the current cycle first
(ADR-057), with no path to target arrears alone. Building that action exposed that
ADR-057's overflow-reduction was already broken for this exact case: it only reduces
`opening_arrears` when `opening_arrears > 0`, so a bill 3 cycles overdue purely from
missed payments (no manual carry-in) had a "Total due" preset that included the live
missed-cycle walk's amount but a clear that couldn't reduce it — paying the shown "Total
due" figure would still show cycles as overdue afterward. Consolidating the live walk
into `opening_arrears` at the moment of any arrears-directed credit (rather than only
ever subtracting from a pre-existing manual figure) fixes both problems with one
mechanism.

Scope note: only the amount actually credited toward arrears reduces `opening_arrears`;
a partial arrears payment consolidates the current total first, then subtracts, so a $50
payment against $300 in live missed-cycle arrears correctly leaves $250 (not $0, and not
silently un-reduced).

Extends: ADR-049, ADR-057, ADR-075.

Status: Decided 2026-08-21. Implemented 2026-08-21. No schema change — reuses
opening_arrears/arrears_as_of/resolved_cycle_due_date.

## ADR-077: "Correct This Payment" — In-Place Ledger Repair for Partial Payments (Extends ADR-037)

Decision:
New `useCorrectPayment` (`payments.ts`) and a "Correct this payment" action alongside
Reverse/Delete on a bill/debt's linked transactions (Bills/Debts/Everything Recent
Transactions). Lets a cleared, linked transaction's amount/date/account be edited in
place, but ONLY when both the original amount and the corrected amount are partial
payments toward the same still-open cycle (neither the stored `cycle_paid_to_date`
before the edit nor after it would meet/exceed the cycle's due amount — no resolve/roll
boundary is crossed in either direction). The payable's `cycle_paid_to_date` is adjusted
by the delta (`corrected − original`); the transaction row itself is updated in place,
not replaced.
If the correction would cross a resolve boundary (the original payment already resolved
the cycle, or the corrected amount newly would), the mutation throws with a message
pointing at Reverse + redo instead — that case isn't handled in v1.

`findStrandedBillPayments`/`findStrandedDebtPayments` and their repair panels
(`StrandedBillRepair`/`StrandedDebtRepair`) gain a second action, "Credit now," next to
the existing "Clean up" (delete-and-redo): applies the stranded transaction's
already-cleared amount to the payable via the same crediting path Submit/Clear uses
(`applyClearedPayment`), instead of deleting the row and asking the user to redo the
payment. The transaction itself is untouched — only the payable's counters catch up.
"Clean up" stays available for cases where the transaction itself is also wrong and
needs to be re-entered.

Reason:
ADR-037's addendum (2026-08-20) locked amount/status editing on linked transactions to
close the gap that caused the Beiers/Peacock stranded-payment bugs — correctly, since
unrestricted editing bypassing `applyClearedPayment` was the root cause. But that left no
way to fix a simple data-entry mistake (wrong amount/date/account on an otherwise-valid
partial payment) without deleting real ledger history and redoing it from scratch. The
partial-only restriction keeps this safe: adjusting `cycle_paid_to_date` by a delta is
unambiguous exactly when no due-date roll is involved; once a resolve is in play, later
transactions may already assume the rolled-forward state, and unwinding that safely needs
more than this ADR scopes — deferred rather than guessed at.
The stranded-repair "Credit now" addition is the same idea applied to a stranded
(never-credited) row: since nothing was ever credited, there's no delta to compute —
crediting the existing row via the normal payment path is strictly simpler and preserves
the real transaction instead of discarding it.

Extends: ADR-037.

Status: Decided 2026-08-21. Implemented 2026-08-21. No schema change.

## ADR-078: Separate `arrears_paid_to_date` Counter, Decoupling Arrears Payments From `arrears_as_of` (Extends ADR-049, ADR-076)

Decision:
Add `arrears_paid_to_date numeric default 0` to `bills` and `debts`. `computeArrears`
(`arrears.ts`) changes its formula to `max(0, openingArrears + missedAmount −
arrearsPaidToDate)` — the live missed-cycle walk always computes its full raw total
(current cycle included), `opening_arrears`/`arrears_as_of` revert to ADR-049's original
meaning only (a one-time manual pre-tracking carry-in), and `arrears_paid_to_date` is a
running total that:
- `applyArrearsPayment` (ADR-076) increments by the payment amount, instead of writing
  `opening_arrears`/`arrears_as_of`.
- `applyClearedPayment`'s overflow-into-arrears reduction (the ADR-076 generalization,
  both bills and debts) also increments it by the overflow, instead of writing
  `opening_arrears`/`arrears_as_of`.

No reset condition — plain monotonic accumulation. (Caught during implementation: an
earlier draft of this ADR called for resetting on every cycle resolve, reasoning that
missed cycles the counter was tracking fall behind the walk's new start once it rolls
forward. That's wrong — `cycle_paid_to_date` resets on *every* resolve, overflow or not,
so a literal reading would wipe out legitimately-accumulated arrears credit the very
next time any normal payment resolves the current cycle. In fact a resolve only ever
advances the due date by one cycle, and that shrinkage is always covered by
`cycle_paid_to_date`, never overlapping with what `arrears_paid_to_date` tracks — no
reset is needed for the walk and the counter to stay consistent.)

One pre-existing edge case this doesn't (and isn't meant to) solve: `applyArrearsPayment`
never touches `cycle_paid_to_date` (ADR-076, by design — Submit/Clear stays independently
available for the current cycle), so if an arrears payment covers a cycle that later
becomes "current" as the due date rolls forward, `deriveCycleInfo` still shows that cycle
as unpaid and offers Submit — paying it there too would double-pay it. Already an
accepted ADR-076 UX gap, unrelated to this ADR's fix.

`priorCyclesArrears`/`arrearsPaymentTag` need no code change — they already compute from
`computeArrears`'s output, which stays correct under the new formula.

Reason:
ADR-076 wrote arrears payments through `opening_arrears`/`arrears_as_of`, reusing
ADR-049's fields. That's wrong for this shape of consolidation: `arrears_as_of` can only
suppress a PREFIX of the missed-cycle walk (`counts = cursor > asOf` — cycles on/before
it don't recount), correct for ADR-049's original case where the thing being consolidated
(pre-tracking history) is always the walk's earliest part. ADR-076 consolidates the
OPPOSITE shape: `priorCyclesArrears` deliberately excludes the walk's first (current)
cycle so Submit/Clear can still credit it normally — meaning everything EXCEPT the
earliest entry gets folded in. Setting `arrears_as_of = today` to represent that doesn't
suppress "everything after the current cycle" — it suppresses the ENTIRE walk, including
the current cycle, since every past-due cycle's date is before today by definition.
Surfaced 2026-08-21 via Lovable QA: a $50 payment against $200 in prior arrears (current
cycle $100 + 2 further missed cycles) correctly reduced what future arrears payments
could draw down, but the immediate PastDueBadge dropped to $150 instead of $250 — the
current cycle's own $100 vanished because the whole walk was suppressed, not just its
already-consolidated tail.

A running counter sidesteps the direction problem entirely: it's subtracted from
whatever the walk (always computed fresh, in full) currently totals, regardless of which
part of that total it's covering.

Migration:
```sql
alter table bills add column if not exists arrears_paid_to_date numeric default 0;
alter table debts add column if not exists arrears_paid_to_date numeric default 0;
notify pgrst, 'reload schema';
```

Extends: ADR-049, ADR-076.

Status: Decided 2026-08-21. Implemented 2026-08-21 — pending the SQL migration above
being run manually in the Supabase SQL Editor.

## ADR-079: DB Trigger to Actually Maintain `bills`/`debts.updated_at`

Decision:
Add a Postgres trigger function and `BEFORE UPDATE` triggers on `bills` and `debts` that
set `updated_at = now()` on every row update, at the database level.

```sql
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_bills_updated_at on public.bills;
create trigger set_bills_updated_at
before update on public.bills
for each row execute function public.set_updated_at();

drop trigger if exists set_debts_updated_at on public.debts;
create trigger set_debts_updated_at
before update on public.debts
for each row execute function public.set_updated_at();

notify pgrst, 'reload schema';
```

Reason:
Found 2026-08-22 while diagnosing why "Credit now" rejected a correct payment on the
Beiers bill: `bills`/`debts.updated_at` has a `default_value: now()` (applies on INSERT
only) but no DB trigger, and no application code path (`payments.ts`, `data-hooks.ts`'s
`useUpsertBill`) ever sets it explicitly on UPDATE — so it's frozen at insert time
forever, regardless of how many times a row is actually written. This silently
undermines two "was this touched recently" checks built this session:
`findStrandedBillPayments`/`findStrandedDebtPayments`'s dedup guard (skip flagging a row
if `updated_at` has moved past the stray ledger rows — never true, since it never moves)
and `computeArrears`'s `clearedRecently` check for monthly debts (trusts
`payment_status='cleared'` only when `updated_at` is recent enough — also never true).
Neither check is unsafe as a result (both just fail closed, falling back to their
pre-existing behavior), but neither works as designed either. A single DB-level trigger
fixes this for every current and future write path at once, instead of hunting down and
patching every `.update()` call site in the frontend individually.

Scoped to `bills`/`debts` only — the two tables the affected checks actually read.
Other tables with an `updated_at` column (`accounts`, `transactions`, `savings_goals`,
`institutions`) can get the same trigger later if something ends up depending on theirs
too; not needed now.

Status: Decided 2026-08-22. Not implemented.
## ADR-080: Overdue Bills/Debts Stay in "Due This Period" Until Paid

Decision:
`obligationsInRange()` and `deductedObligationsInRange()` (`src/lib/paycheck-budget.ts`)
now include a bill/debt when its due date falls before the period's `start` too, as long
as the period hasn't fully elapsed (`end > today`) — not just when the due date falls
strictly inside `[start, end)`. An overdue item keeps showing at its normal per-cycle
amount in the current period and every future period's "due this period" list until it's
actually paid (the only thing that advances `next_due_date`/`debtDueDate` past `start`).
Already-elapsed past periods are left alone — this isn't retroactive, and doesn't affect
what a historical period showed at the time.

Reason:
Found 2026-08-22: Dashboard's "Still owed this period" (`app.index.tsx`'s
`periodObligations`/`owedByCategory`) and Paycheck Budget's "Due this period" both drove
off `obligationsInRange()`, which only matched `inRange(due, start, end)` — an overdue
bill/debt whose due date had slipped before the period start simply vanished from the
normal list, even though it was still unpaid and still owed. It only appeared in the
separate "Past due"/"Overdue" section (Dashboard's `computeArrears()`-based `overdue`
list), which is driven by different logic and doesn't feed Paycheck Budget at all. User
confirmed (2026-08-22) this should fix at the shared `obligationsInRange()` level so both
screens pick it up, and that overdue items should keep appearing "every period until
it's actually paid" rather than being special-cased to only the current period.

Status: Decided 2026-08-22. Implemented 2026-08-22.

### ADR-080 note (2026-08-27, see ADR-049 addendum): interaction with "Past due"

Keeping an overdue item in "due this period" overlapped with the Dashboard's
"Past due" card, which counted the *same* cycle again via
`computeArrears().amountOverdue` (it folds the current cycle in). The Dashboard
"Past due" total now uses `priorArrearsSummary()` — prior calendar months only —
so an overdue item shows in both "Still owed this period" (its current cycle) and
"Past due" (its earlier missed cycles) without the shared cycle being counted
twice. ADR-080's list-membership rule here is unchanged.

## ADR-081: Auto-Transfer Tracking (Recurring Transfers with Due-Date Reminder)
Decision:
New `auto_transfers` table tracks recurring auto-transfers between the household's own
accounts (e.g. SoFi/Stash biweekly investing sweeps) as their own item type, distinct
from Bills and from ad-hoc Transfers. Columns mirror `bills`' scheduling fields
(`next_due_date`, `billing_cycle`, `cycle_interval_days`, `is_active`) plus
`from_account_id`/`to_account_id`/`amount`/`category_id`, but omit all
arrears/partial-payment columns (`cycle_amount_due`, `cycle_paid_to_date`,
`opening_arrears`, etc.) — an auto-transfer either happened this cycle or it didn't,
there is no partial state.

`transactions` gains `linked_auto_transfer_id uuid references auto_transfers(id)`,
following the same self-tagging pattern as `linked_bill_id`/`linked_debt_id`. A
"Process transfer" action writes a normal ADR-056 transfer pair (two cleared
transactions sharing `transfer_group_id`, debit on `from_account_id`, credit on
`to_account_id`) but tags **only the credit leg** with `linked_auto_transfer_id`. This
lets the existing `deriveCycleInfo()` ledger-state machinery (ADR-036) work unmodified —
it sums cleared amounts linked to the payable, exactly as it does for a bill's
single-sided payment — so an auto-transfer collapses naturally to two ledger states,
unpaid ("not yet processed") and cleared ("processed"), reusing the same 4-state
function without a partial/pending case ever firing.

`PayableKind` extends to `"bill" | "debt" | "auto_transfer"`, and `obligationsInRange()`
(ADR-060/080) gains a third loop over active auto-transfers so they count toward "due
this period" on Paycheck Budget and the Dashboard hero, and inherit ADR-080's "stays due
every period until processed" behavior for free.

Auto-transfers are deliberately kept visually and lexically separate from Bills/Debts
everywhere they surface (own section on the Bills screen, own Dashboard card, "🔁
Auto-transfer" kind tag on Paycheck Budget rows) and use softer "check on this" copy
instead of red past-due/arrears language when overdue, since nothing is actually owed to
a vendor — the transfer already happened at the bank; the app is just unconfirmed.

Reason:
Surfaced by the 2026-08-20/21 SoFi-Invest/Stash-Invest cleanup: both had been
mis-modeled as Bills to get a due-date reminder, but Bill payments are single-sided and
never credited the destination account, silently under-crediting it. ADR-056's Transfer
mode correctly double-enters the money but has no recurrence or reminder attached.
Logged as an unscoped gap in `docs/SCRATCHPAD.md` (2026-08-22) with the open question of
what "due"/"paid" means for a transfer with no external vendor — resolved here by
reusing the existing bill-scheduling and ledger-state machinery structurally, while
keeping the user-facing language honest about there being no vendor and no real
"overdue" money.

Status: Decided 2026-08-24. Schema migration run and confirmed live via the
read-only MCP. Code landed (data layer, Bills screen section, Paycheck Budget,
Dashboard card) — see the implementation note below for one deliberate
deviation from this decision's original wording. Not yet browser-verified
(Windows AppLocker blocks local `vite`/`tsc`); see docs/TODO.md.

Implementation note (2026-08-24): rather than extending the existing
`Payable`/`PayableKind`/`deriveCycleInfo` machinery in `payments.ts`/
`ledger-state.ts` to a third kind, auto-transfers got a parallel, dedicated
module (`src/lib/auto-transfers.ts`) instead. That existing machinery turned
out to be deeply bill/debt-specific (ternaries throughout for arrears/
partial/pending/fee logic that doesn't apply here), so threading a third kind
through it would have been a much larger, riskier change than the ADR's
original wording assumed. The dedicated module still reuses the same
ledger-state *pattern* (a `CycleInfo`-shaped return, the same due-window/
resolved-lookback logic, `stateVisual()` for presentation) — just as a
sibling implementation rather than an inline extension.

2026-08-26 addendum — "Process transfer" write order:
`useProcessAutoTransfer` originally advanced `auto_transfers.next_due_date`
first (mirroring ADR-037's "payable row before ledger"), then wrote the two
transfer legs. A failure on the credit-leg insert then left the due date
already advanced + an orphan debit + no `linked_auto_transfer_id` row, so the
cycle read as unpaid for the *next* period and the current one was silently
skipped. Reordered: both legs first, the `next_due_date` advance last. ADR-037's
rule is about not stranding an orphan transaction against an untouched balance;
here the "payable" write is a scheduling-date bump with no balance, so that
concern doesn't apply, and not skipping the cycle matters more. A failed date
advance now leaves a complete, correctly-tagged pair that
`deriveAutoTransferState` still reads as "cleared" (off the credit leg's
`resolved_cycle_due_date` tag) against the un-advanced date. Orphan-debit risk
on a failed credit leg is unchanged and still matches `useSaveTransfer`. No
schema change.

2026-08-26 addendum — code-review follow-ups (findings 2, 4, 5, 6):

- **"Processed / Undo" never appeared (finding 6, the real bug).** Processing
  advances `next_due_date` and tags the credit leg with the cycle it closed
  (one interval back). `deriveAutoTransferState`'s `eligible` filter drops any
  leg tagged earlier than the current due date, so a just-processed transfer
  flipped straight back to "unpaid" and lost its Undo affordance — and the user
  could immediately re-process, advancing the date again. Fixed: the
  resolved-cycle lookback now fires whenever `today < next_due_date` (was
  `today <= next_due_date - 1 interval`) and matches the credit leg's exact
  `resolved_cycle_due_date` tag against `linked` (not the filtered `eligible`).
  A processed cycle now reads "cleared" until its (advanced) due date arrives,
  then correctly returns to "unpaid" for the next cycle. Surfaced by the first
  unit tests for this module (`src/lib/auto-transfers.test.ts`).
- **Server-side double-process guard (finding 2).** Before writing,
  `useProcessAutoTransfer` queries for a cleared leg already tagged
  `resolved_cycle_due_date = at.next_due_date` and refuses if one exists —
  backstop for the same-cycle race the UI's client-only "hide button when
  cleared" doesn't cover.
- **Deterministic undo (finding 5).** `useUndoAutoTransferProcess` targets the
  leg tagged to the cycle `next_due_date` was just advanced past
  (`resolved_cycle_due_date = reverseDate(next_due_date)`), falling back to
  most-recent-by-date only for legs written before the tag existed. Two cycles
  processed the same day now undo in the right order.
- **Paused auto-transfers (finding 4).** The Bills-screen list rendered
  `is_active = false` rows with a live "Process transfer" button. They now show
  a dimmed card with a "Paused" pill and no action button (still editable to
  reactivate). `obligationsInRange` and the Dashboard reminders already
  excluded them.
- Not changed (finding 3): the processed transaction is still dated "today".
  Dating it at the (past) due date instead would fall outside
  `deriveAutoTransferState`'s half-open `d > openStart` window and break state
  detection — the today-date is load-bearing.

No schema change.

2026-08-26 addendum — RLS was missing on `auto_transfers`:
The original ADR-081 SQL block included an `enable row level security` +
`household access` policy for `auto_transfers`, but it was never run — the table
shipped with RLS DISABLED and zero policies. Any authenticated user could
read/write/delete any household's auto-transfer rows directly via PostgREST
(the app's own `useAutoTransfers` query filters by `household_id`, which masked
this). Fixed 2026-08-26 as part of ADR-083's RLS hardening
(`scripts/migrations/2026-08-26-rls-hardening.sql`): `enable row level
security` + `create policy "household access" ... using/with check
is_household_member(household_id)`, matching every other data table.

## ADR-082: Explicit Deduction Kind; Three-Way Past Due Grouping

Decision:
Add `income_source_deductions.kind text not null default 'payroll'`, CHECK-constrained
to ('payroll','hsa','fsa','other'). This becomes the single source of truth for
classifying a deduction, replacing the `fundingLabel()` heuristic in `app.index.tsx`
that regex-matches /hsa|fsa/ against the destination account's name/type.

The Dashboard "Past due" section's grouping changes from binary
(`debts.is_paycheck_deduction` only, debts only) to three-way:
- Payroll deduction — items funded by a kind='payroll' deduction, plus legacy
  `debts.is_paycheck_deduction=true` debts with no `funding_deduction_id`.
- HSA / FSA — items funded by a kind IN ('hsa','fsa') deduction.
- Other — ordinary bills/debts.

An overdue item counts as deduction-funded if it has a `funding_deduction_id` (bill OR
debt — ADR-068 already gave bills this column, so deduction-funded bills now group
correctly instead of falling into "Other"), or, for debts only, the legacy
`is_paycheck_deduction` flag. Classification lives in a pure helper in
`src/lib/deduction-funding.ts`; the Dashboard is this ADR's only consumer.

`debts.is_paycheck_deduction` is unchanged in meaning and keeps its ADR-032 role
(exclude the debt from obligation/budget math). `kind` is purely additive — a debt may
carry both. The income-source detail deduction dialog gains a "Kind" picker
(Payroll / HSA / FSA / Other), defaulting to Payroll.

Migration backfills `kind` from the existing heuristic one final time (hsa where the
destination account name/type matches /hsa/i, fsa where /fsa/i, else payroll); after
that the column is authoritative and the heuristic is deleted.

Schema:
    alter table income_source_deductions
      add column if not exists kind text not null default 'payroll';
    alter table income_source_deductions
      add constraint income_source_deductions_kind_check
      check (kind in ('payroll','hsa','fsa','other'));

    update income_source_deductions d
    set kind = case
      when a.account_type ilike '%hsa%' or a.name ilike '%hsa%' then 'hsa'
      when a.account_type ilike '%fsa%' or a.name ilike '%fsa%' then 'fsa'
      else 'payroll'
    end
    from accounts a
    where d.destination_account_id = a.id;

    notify pgrst, 'reload schema';

Reason:
The row-level "HSA-funded" vs "Deduction-funded" label (ADR-068) already exists, but
it's derived by regex on an account name — fragile, and invisible to the Past Due
grouping, which still keys off `debts.is_paycheck_deduction` alone. That flag doesn't
exist on bills, so a deduction-funded bill (ADR-068) that goes past due shows up mixed
into "Other" instead of with the other automatically-handled items. An explicit `kind`
column fixes both the fragility and the bill/debt asymmetry, and gives a real 3-way
split without overloading `is_paycheck_deduction` (which has a separate, load-bearing
budgeting-exclusion job).

Status: Decided 2026-08-26. SQL migration run and verified live via the read-only MCP
(column `kind text not null default 'payroll'`, CHECK against the 4 values; backfill
put HSA → hsa, LPFSA → fsa, the other 22 → payroll). Implemented 2026-08-26:
- `DeductionKind` type + `IncomeSourceDeduction.kind` (`src/lib/supabase.ts`).
- `pastDueGroup()` + `deductionFundingLabel()` pure helpers in
  `src/lib/deduction-funding.ts` (11 unit tests).
- "Kind" picker on the income-source deduction dialog
  (`src/routes/app.income-source.$id.tsx`); `useUpsertIncomeSourceDeduction` passes it
  straight through.
- Dashboard "Past due" (`src/routes/app.index.tsx`) is now three-way: one collapsible
  "Auto-handled off paycheck" section with "Paycheck deduction" and "HSA / FSA"
  sub-lists, plus the ordinary "Other" list. The old `fundingLabel()` regex is deleted.

UI note: the two deduction groups share one collapse toggle (both are "no action
needed" awareness items) rather than collapsing independently — the classification is
three-way, the display keeps the dashboard compact.

## ADR-083: Automated Test Writes via an RLS-Bound Test Household

Decision:
Claude (and any automated test tooling) may create and mutate data ONLY in the
"TEST Household — Lovable QA" household (`e79216a0-b5f9-4987-a675-c52783bddab7`),
never in "Our Household" (`cd8bce8c-81af-4302-8019-113e352ed443`).

The boundary is Postgres Row-Level Security, not a code convention. Test tooling
authenticates a `@supabase/supabase-js` client as
`steven.laszloffy+lovabletest@gmail.com` (role `authenticated`, `rolbypassrls =
false`) using the public anon/publishable key — the same key the app ships. That
user is a member of exactly one household (the test one). Every data table's
policy is `is_household_member(household_id)` for both `USING` and `WITH CHECK`,
so the database physically rejects any read or write the test user attempts
against the real household (`INSERT` → `42501 new row violates row-level
security policy`; `UPDATE`/`DELETE` → 0 rows, filtered by `USING`). Verified
2026-08-26.

Rules:
- Automated test DB access goes through `scripts/test-db.mjs` (`testClient()`),
  which signs in, asserts the user reaches exactly one household and it is the
  test one, probes that the real household is invisible, and only then returns a
  client. `inTestHousehold(row)` stamps/asserts `household_id` on every write.
- The read-only Supabase MCP stays read-only. It is privileged (sees all
  households) and is for verification only.
- Claude must NEVER be given the `service_role` key or a direct `postgres`
  connection string — both have `BYPASSRLS` and would defeat the boundary. This
  is the load-bearing rule; RLS + FORCE only protect the `authenticated` path.
- Never add `steven.laszloffy+lovabletest@gmail.com` to "Our Household". Never
  put the real users' credentials in `.env.test`.
- Test credentials live in a gitignored `.env.test` at the repo root.
- Before a writing test session, run `scripts/test-db-preflight.sql` via the
  read-only MCP; every check must pass.

Schema dependency (see `scripts/migrations/2026-08-26-rls-hardening.sql`):
- REQUIRED: `auto_transfers` shipped in ADR-081 with RLS disabled (any
  authenticated user could touch any household's rows — a live bug, not just a
  test gap). Enable RLS + add the `household access` policy.
- Optional: `force row level security` on all 24 tables. Honest note — with
  every table owned by `postgres` (BYPASSRLS), FORCE is a near-no-op today; it
  is future-proofing for a table later owned by a non-bypass role. Confirmed it
  does not break the `is_household_member` SECURITY DEFINER function (also owned
  by `postgres`).

Reason:
Interactive/E2E verification of ledger-touching changes (cycle resets,
auto-transfer processing, deduction funding) needs a real logged-in session and
real row mutations — a unit test can't cover the hook-to-Postgres wiring or the
RLS/schema-cache failure modes. Doing that against the real household risks
corrupting live financial data. A second Supabase project was rejected as too
heavy (double migrations, schema drift, extra keys). An RLS-bound test user in
the same project gives isolation the database enforces, with zero schema
divergence.

Status: Decided 2026-08-26. Implemented 2026-08-26 (`scripts/test-db.mjs`,
`scripts/test-db-preflight.sql`, `.env.test` gitignored, CLAUDE.md rules).
`scripts/migrations/2026-08-26-rls-hardening.sql` run and verified live
2026-08-26: `auto_transfers` now has RLS + the `household access` policy, and
all 24 public tables have `relforcerowsecurity = true`. Boundary re-proven after
the migration (INSERT into "Our Household" → `42501`; `is_household_member`
SECURITY DEFINER still resolves under FORCE). The test-user password was rotated
off the transcript value the same day (`.env.test`).

## ADR-084: Log a Debt Payment (Historical Backfill + Fee/Interest Lines)
Decision:
Debt detail gains a "Log a payment to this debt" button opening a single form:
date, paying account, principal amount, status (cleared/pending), and any
number of fee/interest lines (type, amount, note). The payment date decides the
behaviour — a date inside the current cycle window (from one cycle before
`next_due_date` up to today/future) runs the normal `applyClearedPayment()`
path (cycle counters, payment_status, due-date roll, arrears overflow); an
earlier date is a historical backfill that only reduces `remaining_balance` and
writes the ledger row, leaving all cycle fields alone. Only the principal moves
the debt balance. Each fee/interest line posts its own transaction against the
same account (so account balances stay correct) but never touches
`remaining_balance` — no interest engine exists yet. All rows share one
`split_group_id` and every extra line's description is prefixed "Fee: " so the
existing ADR-046 paired-fee helpers (clear/delete) keep the group atomic.
Payable-first write ordering (ADR-037) is preserved, and the same out-of-order
backdating confirmation used by the Adjustments section applies.
Reason:
Backfilling old debt payments previously required the live pay flow, which
always applied the payment to the current cycle and rolled due dates for
payments made months earlier. Splitting principal from fees/interest in one
form matches how real statements arrive, and keeping fees ledger-only avoids
faking interest accrual against the balance.
Status: Decided 2026-08-26. Implemented.

Addendum (2026-09-04): **a historical payment on a `debt_type='advance'` debt
dated before that debt's most recent advance is ledger-only.** An advance debt
carries ONE running `remaining_balance` covering the current advance; earlier
advances are already settled, so subtracting a backdated repayment from the
balance (and, via `advanceMinimumPaymentPatch`, from `minimum_payment` / amount
due) corrupts the current draw — the symptom the user hit: logging a July
Instacash payment for account accuracy cut the live advance's balance.
`isPreAdvanceHistoricalPayment(debt, date, newestAdvanceDate)` (`src/lib/payments.ts`)
gates it; `useLogDebtPayment` skips the balance write when it's true and still
inserts the ledger row; `LogDebtPaymentDialog` loads `useDebtAdjustments`,
passes `newestAdvanceDate`, and swaps its hint/toast to say the balance won't
change. In-cycle payments and historical payments *after* the newest advance are
unaffected. Data cleanup for the pre-existing Instacash drift:
`scripts/migrations/2026-09-04-cleo-instacash-untangle.sql`.

Cross-note to **ADR-056**: `useCreateAdvance` now also sets `linked_debt_id` on
the advance's deposit transaction so it appears in the debt's Recent
Transactions next to repayments (still tagged `transfer_group_id` for
`useDeleteAdvance`). Because that row is a disbursement, not a repayment,
`isAdvanceDisbursement(t)` (`src/lib/payments.ts`) excludes it from
`deriveCycleInfo` cycle math, the Debt Strategy payment-history tally, and the
Correct/Reverse actions. Existing deposits backfilled by the same script.

Addendum (2026-09-04, Issue #57): **bill equivalent — "Log a payment to this
bill".** Bills had no historical-backfill path; the only options were the live
Submit/Clear flow (always applies to the current cycle) or the arrears-directed
`ArrearsPaymentAction`. Adding a missed past payment required raw SQL (the
2026-09-04 Cleo Plus 8/3 backfill). `LogBillPaymentDialog` +
`useLogBillPayment()` (`src/lib/payments.ts`) mirror the debt version's shape —
one form: date, paying account, amount, status — but simpler: bills carry no
running principal balance for a historical payment to reduce, and no fee/interest
lines (out of scope for this issue). The date decides behaviour via
`isWithinCurrentBillCycle(bill, date)` / `billCycleWindowStart(bill, today)`
(new, `src/lib/payments.ts`): a monthly bill's window is the *calendar month
containing `today`* per ADR-086 (resets on the 1st, independent of due day); a
non-monthly bill keeps the `next_due_date`-anchored rolling window (mirrors
`debtCycleWindowStart`, kept separate rather than shared since the debt version
predates ADR-086 and doesn't apply its calendar-month rule); a one-time bill
(ADR-048) has no historical concept — every date is in-cycle. An in-cycle date
runs the normal `applyClearedPayment()` path; an elapsed-cycle date writes a
plain `linked_bill_id` ledger row and leaves the bill's cycle fields untouched.
Rendered on the Bills detail panel next to `PastDueEditor`, same placement
pattern as the debt dialog. Tests: `isWithinCurrentBillCycle` /
`billCycleWindowStart` in `payments.test.ts` (monthly, non-monthly, one-time).

Addendum (2026-09-14): **revisiting "no fee/interest lines" — bill payments
now support them too.** The 2026-09-04 scope call above left bills unable to
record a fee alongside a payment except through the main pay-flow's Submit
dialog (ADR-046), not "Log a payment to this bill" — surfaced by a real case
(a Flex rent installment with its own fee, logged historically). Ported the
debt dialog's fee-line pattern: `DebtPaymentLine` is renamed `PaymentLine`
(`src/lib/payments.ts`, now shared), `LogBillPaymentInput` gains
`lines: PaymentLine[]`, and `useLogBillPayment` mirrors
`useLogDebtPayment`'s `extras` handling — a `split_group_id` groups the
payment row with any fee/interest rows, each fee row unlinked (`linked_bill_id`
stays null, so it's excluded from cycle credit, same as debt fee lines are
excluded from `remaining_balance`) and categorized via `feeCategoryId()`
(already shared, not duplicated). `LogBillPaymentDialog` gains the same
"Fees & interest" add/line UI as `LogDebtPaymentDialog`. No change needed to
group display/editing (`isPaymentWithFeesGroup`, `LinkedGroupDetail`) — both
already treat bill-linked and debt-linked payment+fee groups identically.
Verified end-to-end against the TEST household: a logged payment with a fee
line produced two rows sharing a `split_group_id`, the fee row unlinked and
categorized "Fees," rendering correctly in `LinkedGroupDetail`'s edit view.

Status: Decided 2026-09-14. Implemented (`src/lib/payments.ts`,
`src/components/LogBillPaymentDialog.tsx`, `src/components/LogDebtPaymentDialog.tsx`).

## ADR-085: Debt Detail Reads Ledger-Derived Cycle State; Cycle Window + Pay Period Fields
Decision: The Debt detail panel derives "Payment status", "Paid this cycle" and
"Still owed this cycle" from `deriveCycleInfo` (ADR-036) rather than the stored
`payment_status` / `cycle_paid_to_date` columns; a stored `payment_status` that
disagrees is shown only as a secondary "stored: …" note. `CycleInfo` now carries
`windowStart`/`windowEnd`, surfaced as a "Cycle window" field, and a "Pay period"
field shows the primary-paycheck period (ADR-059/060 `periodRange`) containing the
debt's due date.
Reason: A fully-paid monthly debt resets `cycle_paid_to_date` to 0 and has no
`next_due_date` to roll, so the raw columns showed "Pending / $0.00 paid / $106.30
still owed" the day after a full on-time payment — contradicting the list, Everything
and Dashboard screens, which all use the ledger machine. Exposing the window makes
the cycle math auditable instead of implicit.
Status: Decided 2026-08-26. Implemented.

### ADR-085 addendum (2026-08-26): billing-period window + stored-status sync
Decision: The "Cycle window" field shows the debt's billing period (one billing
cycle back from its effective due date, to that due date), with the derivation's
narrower counting range as a secondary line. Where the stored `payment_status`
diverges from the ADR-036 derived state, the detail panel offers a "Sync stored
status" action (`useSyncStoredStatus()`) that writes the derived state and
`cycle_paid_to_date` back onto the row.
Reason: The raw derivation window (e.g. "Aug 18 – Aug 26") is an implementation
detail and read as nonsense; and a backdated payment can leave a stale
"pending" on the row that no screen could repair.
Status: Decided 2026-08-26. Implemented.

### ADR-085 addendum (2026-08-27): month stepper to inspect a prior cycle; Bills detail reaches parity

Decision:
`useCycleState(refDate?)` (`src/lib/ledger-state.ts`) takes an optional reference
date, defaulting to the real today, so every existing call site is unchanged.
`deriveCycleInfo` is already a pure function of its reference date.

The Bills and Debts detail panels gain a **month stepper** (shared
`CycleMonthStepper`) above the cycle figures: ‹ prev / next › with a "This month"
reset. It re-derives the panel's `cycle`/`info` for the selected month (a
`YYYY-MM-15` `refDate`), so "Payment status", "Paid this cycle", "Still owed this
cycle", "Cycle window" and the linked-transaction list all reflect that month.

- **Monthly items only.** A non-monthly item's cycle window hangs off the single
  mutable `next_due_date` pointer with no history, so an older reference date
  can't faithfully reconstruct a past biweekly/weekly/custom window — those
  render one muted line ("Historical cycle view isn't available for non-monthly
  items") instead of the stepper.
- **`refDate` ≠ today disables every write-back of *derived* state:** the "Sync
  stored status" button and `PayActions` / `ArrearsPaymentAction` (Debts) /
  `SetAsideAction` (Bills) are hidden, replaced with a one-line note pointing at
  the per-transaction Correct / Reverse actions. *Ledger-row* actions stay
  enabled — `LogDebtPaymentDialog` (ADR-084, date-driven), `PastDueEditor`,
  `BillAdjustments` / `DebtAdjustments`, and per-transaction Delete / Correct /
  Reverse. `RecentBill/DebtTransactions` scopes to the viewed month.

**Bills detail reaches ADR-085 parity.** It had been showing the raw
`bill.payment_status` column and `billCycleDue`/`billRemainingOwed`; it now
derives its cycle state from `deriveCycleInfo` like the Debts panel, with a muted
`stored: …` line when the two disagree (read-only — no Bills "Sync" button).

Also adds a right-now rollup to both panels (current view only): "Still owed this
cycle" + "Past due (earlier cycles)" (`priorArrearsSummary`, ADR-049 addendum) +
"Total owed".

Reason: `deriveCycleInfo` is always anchored to the real today, so once the
calendar rolls a user can't inspect or correct the prior month's cycle in place.
The stepper restores that without any new persistence.

Status: Decided 2026-08-27. Implemented 2026-08-27. No schema change.

## ADR-086: Monthly cycles are the calendar month
Decision: In `deriveCycleInfo` (ADR-036), a monthly bill/debt's cycle is the
calendar month containing today — every linked transaction dated in that month
counts toward that cycle, early or late, and the cycle resets on the 1st. The
ADR-075 `resolved_cycle_due_date` tag is compared by month for monthly items
(only a tag from a *previous* month excludes a transaction). Non-monthly cycles
(biweekly / weekly / custom interval / one-time) keep the existing
`next_due_date`-anchored rolling window unchanged. `CycleInfo.resolved` is still
set for a cleared monthly cycle whose `next_due_date` has already rolled past
the month end, so the stranded-payment repair and reversal paths behave as
before. Debt detail's "Cycle window" now shows this counted range directly (e.g.
Aug 1 – Aug 31); non-monthly items additionally show their billing period.
Reason: The window hung off `next_due_date` drifts with the stored row. A drift
check across 42 debts found 4 rows whose `next_due_date` day no longer matches
`due_day` (Aarons - Dresser 21→Aug 18, Alpine Medical - Stephanie 18→Jul 29, and
two biweekly rows), producing nonsense windows like "Aug 18 – Aug 26" and a
cleared on-time payment reading as unpaid. Anchoring by `due_day` was rejected
because `bills` has no `due_day` column at all — the calendar month is the one
rule both tables can express, and it matches how the household actually thinks
about a monthly bill.
Status: Decided 2026-08-26. Implemented.

## ADR-087: Hybrid Task Tracking (GitHub Issues/Milestones + docs/)

Decision:
Open, actionable work is tracked in **GitHub Issues**; phase progress in **GitHub
Milestones**; categorisation via a small **Label** set (`schema`, `ledger`,
`mobile`, `verification`, `tech-debt`, plus the GitHub defaults). The `docs/`
system stays the source of truth for everything that belongs with the code:
ADRs (`DECISIONS.md`), current-state briefing (`CONTEXT.md`), schema
(`SCHEMA.md`), architecture (`ARCHITECTURE.md`), dated history (`CHANGELOG.md`),
per-session log (`SESSION.md`), unready ideas (`SCRATCHPAD.md`).

`docs/TODO.md` is repurposed: it no longer lists tasks, only
working-as-designed limitations (so a future session doesn't "fix" them). There
is no `ROADMAP.md` — phases are Milestones.

When a PR closes a tracked Issue, its body carries `Closes #N` so GitHub links
and auto-closes on merge (the PR "Development" section).

The repo is **private** (changed from public 2026-08-27), so Issues are not
world-readable.

Reason:
The doc system is well suited to a mostly-solo, heavily-AI-assisted project — it
loads into the agent's context automatically each session, is versioned with the
code, and is greppable offline. But it has no commit↔task↔PR linking, no
per-phase progress view, and no notifications. Issues/Milestones add exactly
those without pulling ADRs / context / schema out of the repo. Task state
(discrete, closeable, benefits from PR linking) moves out; reference material
(needs to travel with the code and be in-context) stays.

GitHub Projects (v2 boards) were considered and skipped: the Codespaces
`GITHUB_TOKEN` cannot manage them (`Resource not accessible by integration`), so
they would be manual-only, and a board duplicates the Milestone/phase view at
this scale.

Status: Decided 2026-08-26. Implemented 2026-08-27 — labels + Milestones (Phase
12–14) + Issues #4–#10 created; `docs/TODO.md` stubbed; `CLAUDE.md` updated;
`README.md` rewritten to point here. Repo set to private by the user 2026-08-27.

---

## ADR-088: Per-Account Owner (`accounts.owner_member_id`); Member-Scoped Spendable & Net Worth

Decision:
Add `accounts.owner_member_id uuid` (nullable, `references household_members(id)
on delete set null`). **Null = shared/joint** — the account folds into every
member's numbers. Non-null = personal to that member — it folds into only that
member's numbers.

```sql
alter table accounts
  add column owner_member_id uuid references household_members(id) on delete set null;
```

No new RLS policy. Both household logins keep full read/write on every `accounts`
row (ADR-002 shared visibility). `owner_member_id` changes only which accounts
fold into a viewer's *aggregates* — never what they can see or edit, and never
the ledger.

- `AccountDialog` gains a **"Belongs to"** select (`Joint` / each member's
  `display_name`) bound to `owner_member_id`, and an **"Include in net worth"**
  checkbox bound to the existing-but-unused `accounts.include_in_net_worth`
  column (same shape as the ADR-021 `is_spendable` checkbox).
- New `src/lib/household.ts`: `useHouseholdMembers()` (the household's member
  rows) and `useCurrentMember()` (the caller's row, resolved via `auth.uid()` —
  same pattern as `useMemberTheme` in `src/lib/theme.tsx`).
- New predicate `accountInMemberView(account, viewerMemberId)` in
  `src/lib/balances.ts`: `true` when `owner_member_id` is null, equals the
  viewer, or the viewer id is unknown (safe default → show everything).
- Applied to:
  - Dashboard **combined spendable** total and its checking / available-credit /
    savings breakdown (`src/routes/app.index.tsx`).
  - **Net worth** total and 6-month trend (`src/routes/app.index.tsx` →
    `netWorthTrend`), which additionally skips accounts with
    `include_in_net_worth === false`.
  - **Status Snapshot** balance subtotals and spendable total
    (`src/routes/app.snapshot.tsx` → `buildBalanceSubtotals`) — the report is
    "my picture", generated per-viewer.
- The Accounts screen (`src/routes/app.accounts.tsx`) lists **every** account
  regardless of owner, with an owner chip on the card and a new "Owner" entry in
  its filter row.
- Unchanged and still whole-household: `computeBalances`, per-account balance
  cards, the transactions ledger, `computeInstitutionTotals`, paycheck budget,
  arrears.
- All 15 existing accounts stay `null` (joint) after the migration — behavior is
  identical until an account is explicitly tagged.

This amends the `docs/SCHEMA.md` "Known Schema Rules → Never Add →
User-specific ownership columns on financial tables" rule: that rule guards
against per-user *RLS / row visibility*. A display-scoping tag that changes
nobody's access or edit rights is explicitly allowed — same reasoning as
ADR-061's per-user `household_members.theme` column.

Reason:
The two logins share all data (ADR-002), but in practice some checking / credit
accounts are effectively one person's. Summing all of them into one "combined
spendable" and one net worth overstates what either person can actually spend
and distorts the dashboard. A nullable owner tag lets each account be marked
personal or joint; a personal account drops out of the *other* member's
headline numbers while staying fully visible and editable to both, and the
shared ledger is untouched. `include_in_net_worth` already existed unused —
wiring it in the same change covers "keep this account off the trend" (a
tracking-only card, a locked HSA) without inventing a second concept.

Status: Decided 2026-08-27. Implemented 2026-08-27 (Issue #36, PR #39).

## ADR-089: Internal transfers are not spending; budget drill-down date range
Decision:
A transfer (ADR-056) counts as spending only when it is one-sided. Two-sided
transfers — a negative and a positive row sharing the same `transfer_group_id`,
i.e. money moved between the household's own accounts — are excluded from
spending actuals and trailing averages (`internalTransferIds()` in
`src/lib/internal-transfers.ts`, applied in `combinedActualByCategory`
(`src/lib/monthly-summary.ts`) and `buildActualResolver`
(`src/lib/spending-actuals.ts`)). A leg with no counterpart row still counts as
spend, because the money left the household. Budget drill-downs set
`excludeInternalTransfers` on the `TxPreFilter` so the Transactions list matches
the figure it was opened from.

Also fixed: the Monthly Summary drill-down built its date range as
`${g.month}-01` / `${g.month}-31` while `g.month` is already a `YYYY-MM-01`
monthKey, producing the impossible range `2026-08-01-01`..`2026-08-01-31` and an
always-empty list for every category. It now uses the month key itself and a
computed real end-of-month.

Reason:
Savings showed $1,710.34 "spent" in August that was entirely two transfer legs,
and tapping the drill-down icon listed nothing at all. Neither number was real:
one came from counting internal money movement as spend, the other from a
malformed date filter.

Status: Decided 2026-08-31. Implemented.

## ADR-090: Fix Places covers every fixable place-less row
Decision:
Fix Places (`src/routes/app.fix-places.tsx`) now surfaces every money-out
transaction with no `institution_id` except legs of an internal (two-sided)
transfer, which have no merchant by definition (ADR-056/089). Split lines
(ADR-044) and one-sided transfer legs are included — a split line is an
ordinary purchase and often happened somewhere different from the rest of its
group, and a one-sided leg means money left the household. Spending by Place
applies the same internal-transfer exclusion to both its rankings and its
"no place attached" footnote, and the footnote links to Fix Places with the
count of rows it can repair.

Reason:
Spending by Place reported $14,238.72 of place-less August spending while Fix
Places showed none of it: $12,522 was internal transfer legs (never fixable)
and $1,650 was split lines (fixable, but filtered out). The two screens have to
count the same rows, or the footnote is an unactionable alarm.

Status: Decided 2026-08-31. Implemented.

## ADR-091: One "Edit" for linked transactions (payable-aware edit)

(Originally drafted as a second ADR-088 on the 2026-08-31 feature branch, which
collided with the ADR-088 already on `main` from 2026-08-27. Renumbered to 091
on 2026-09-01; code comments updated to match.)

Decision:
A bill/debt-linked transaction is edited through the ordinary transaction Edit
button, not a separate Correct/Reverse affordance. Amount, date, status and
account are unlocked for linked rows; saving runs rollback-then-reapply on the
underlying payable (`rollbackClearedPayment` + `applyClearedPayment` in
`src/lib/payments.ts`, `useEditLinkedTransaction`) so `remaining_balance`,
`cycle_paid_to_date`, `payment_status`, `date_paid_off` and any
`resolved_cycle_due_date` tag are recomputed for the new values, including
across the pending/cleared boundary. Delete is replaced by Reverse (ADR-070)
for linked rows. A group that is exactly one linked payment plus plain fee
lines on one account is classified `payment-with-fees`
(`src/lib/split-groups.ts`) and opens a grouped editor that edits the payment
and its fees together, allows adding/removing fee lines, and never
delete-and-reinserts the linked row. Groups with >1 linked row or >1 account
stay per-row (`linked-or-multi`). ADR-077's CorrectPaymentButton remains on
the Bill/Debt detail screens only.

Reason:
ADR-077's Correct button only appeared for an un-resolved partial payment in
an unpaid cycle, so the common case — a cleared payment that closed its cycle,
or a wrong payment+fee split — had no reachable edit path and the transaction
Edit button locked the fields. Users think in terms of "edit the transaction";
keeping the bill/debt in sync is the app's job, not a second workflow.

Status: Decided 2026-08-31. Implemented.

## ADR-092: Rent-to-own debts are tracked at total cost to own

Decision:
A rent-to-own / lease-purchase agreement (Aaron's and similar) is tracked as a
debt whose balance basis is the **total cost to own** — the scheduled payment
times the number of payments — not the early-buyout cash price. `debts.amount`
per cycle is the full scheduled payment with tax rolled in. Any optional add-on
(a protection / insurance plan) is not part of the payment count and is posted
as a fee line (ADR-046), never reducing the balance.

Applied 2026-08-31 to "Aarons - Dresser" (debt `8004b659-7e01-4630-8e76-bea58065ab16`,
"Our Household") via `scripts/migrations/2026-08-31-aarons-dresser-lease-alignment.sql`
(data-only, no schema change): balance basis $97.10 × 24 = $2,330.40 (was the
$1,297.42 cash price); `remaining_balance` $1,942.00 after 4 payments;
`minimum_payment` $97.10. Each historical payment row grew $5.06 and its paired
tax-fee row shrank $5.06, so cash out of the accounts is unchanged. Verified
live 2026-09-01.

Reason:
The tracked balance had been set to the early-buyout cash price, which the
household is not paying — they are on the 24-payment plan, so the amount that
actually retires the debt is the total-cost-to-own figure. Using the cash price
understated the obligation and made payoff-progress math wrong. Tax belongs in
the payment (it is owed every cycle); the protection plan does not (it is
optional and buys nothing toward ownership), so it stays a fee.

Status: Decided 2026-08-31. Implemented 2026-08-31 (migration), verified 2026-09-01.

## ADR-093: External login pages open via `@capacitor/browser`, never a WebView

Decision:
The "Log In" action on the institution and debt detail views opens the
institution's `login_url` through `@capacitor/browser` (`Browser.open({ url })`)
— a system browser / Android Custom Tab — never `window.open`, an `<a>` tag, an
iframe, or an embedded WebView. The plugin is loaded with a dynamic `import()`
inside the click handler so it is never evaluated during SSR and stays out of
the initial bundle. A shared `src/components/InstitutionLoginButton.tsx` renders
the button only when `login_url` is non-empty; when `sign_in_with_google` is
true and `login_username` is set it also shows a display-only hint ("Sign in
with Google — use <username>"). This adds `@capacitor/core` + `@capacitor/browser`
as the project's first Capacitor runtime dependencies; no `capacitor.config.ts`,
native project, or npm scripts are added (that is Phase 12). No new DB columns,
tables, or server changes — the app still never stores, sees, or fills a
password (`docs/SCHEMA.md` "never store passwords" is unaffected).

Reason:
Android's OS-level Autofill (the household uses Keeper) only offers credentials
on a real browser page — a Custom Tab — not an embedded WebView or a page the
app scripts. Opening the true login URL in the system browser lets the OS handle
credential fill entirely, keeping the no-password-storage rule intact while
still making login one tap from the item. `@capacitor/browser` gives the Custom
Tab on Android and degrades to a normal new-tab open on the web build, so the
code written now works unchanged once the Capacitor Android shell lands in
Phase 12. The Google-account hint is needed because a third-party OAuth
`login_hint` cannot be injected into someone else's login page — the person has
to pick the right account manually when Google's chooser appears.

Status: Decided 2026-09-01. Implemented 2026-09-01.

## ADR-094: Debt payoff engine correctness — advances, monthly-equivalent minimums, editable order, recommended payment

Decision:
Five related fixes to the client-side payoff engine (`src/lib/debt-payoff.ts`,
`src/lib/payment-schedule.ts`) and the screens that consume it. No schema change.

1. **Cash advances are excluded from the payoff plan.** `activeDebts()` filters
   out `debt_type = 'advance'` (case-insensitive, matching the DB trigger in
   `2026-09-01-enforce-debt-payoff-date.sql`). An advance's `minimum_payment`
   mirrors its full `remaining_balance`, so the simulation "paid it off" in
   month 1 and then rolled a phantom freed minimum onto the target debt every
   month after — a large false acceleration. Advances stay fully visible on the
   Debts and Everything screens and in obligation totals; they are simply not
   part of the amortisation projection.
2. **Sub-monthly minimums are fed in as their monthly equivalent.** The
   simulation is a calendar-month grid, so `DebtPlanInput.minimum` is now
   `monthlyEquivalent(minimum_payment, billing_cycle, cycle_interval_days)`
   (`src/lib/format.ts`, ADR-033/040; biweekly → ×2, quarterly → ÷3, custom uses
   the interval), with a raw per-cycle fallback when there is no monthly
   equivalent (one-time charges, interval-less custom). The entered biweekly
   values are confirmed per-paycheck amounts (e.g. "FM Jewelry" posts $270.82
   exactly twice, 14 days apart), so treating them as monthly understated real
   payoff power ~2×. **This shifts every projected debt-free date and interest
   total on the Debt Strategy and Payment Schedule screens** — a correction, not
   a regression; projections were always approximate and are never stored
   (ADR-015).
3. **`debts.priority_order` gains an app write path (PR2).** A reorder editor on
   the Debt Strategy screen writes a dense `1..N` over the shown active
   non-advance debts; `DebtDialog` auto-assigns `max(priority_order) + 1` on
   INSERT only. Paid-off / advance debts keep their stored value and are never
   ordered by the engine. Previously the column was set only by direct SQL.
4. **The strategy's recommended payment is surfaced (PR3).** A display-layer
   `recommendedPaymentsThisCycle(debts, settings)` returns, per debt,
   `{ monthlyTarget, monthlyMinimum, rollover }` derived from
   `buildSchedule(plan, extra, strategy, 1)[0]` — i.e. this calendar month's
   minimum plus any snowball rollover that lands on that debt. Surfaced as
   "`$X/mo min · $Y/mo plan`" beside the per-cycle minimum on the Everything,
   Debts and Paycheck Budget screens, only when `rollover > $0.01`; a one-tap
   "Plan $Y" on Paycheck Budget writes an ADR-059 `pay_period_allocations` row
   (ADR-071 then supersedes the auto amount); a "Recommended" preset is added to
   the Submit/Clear pay dialog. Not stored, recomputed every render (ADR-060);
   no new field on `Payable` or `CycleInfo`. `obligationsInRange` /
   `obligationsTotalExcludingPlanned` / left-to-allocate are deliberately
   untouched — the hint is pure text and only the Planned row moves budget math.
5. **Shared helpers.** `orderFor` is exported from `debt-payoff.ts` (it was
   duplicated verbatim in `payment-schedule.ts`); `strategyKeyOf(raw)`
   centralises the stored-string → `StrategyKey` coercion previously copy-pasted
   into both routes (unknown/legacy values → `avalanche`).

Paycheck-deduction debts (`is_paycheck_deduction = true`) stay in the plan
unchanged (ADR-032).

Reason:
The engine was double-counting advances and halving biweekly minimums, so the
projected debt-free date was not trustworthy. `priority_order` — the Custom
strategy's whole input — had no way to edit it in the app. The 12-month schedule
already computes the per-debt "should pay" figure but every screen except
Payment Schedule discarded it and showed only the raw minimum, hiding the point
of a snowball. The duplicated `orderFor` meant a filter change could silently
drift between the two screens.

Status: Decided 2026-09-03. Implemented 2026-09-03 — PR1: advance exclusion,
monthly-equivalent minimums, `orderFor` / `strategyKeyOf` refactor, engine unit
tests. PR2: editable `priority_order` (`useSaveDebtPriorityOrder` writes a dense
`1..N`; `DebtDialog` auto-assigns `max + 1` on INSERT; reorder card on the Debt
Strategy screen; `src/lib/reorder.ts`). PR3: recommended-payment surface —
`src/lib/debt-recommended.ts` (`recommendedPaymentsThisCycle` /
`useRecommendedPayments`, from `buildSchedule(...,1)[0]`), a "$X/mo min · $Y/mo
plan" hint on Everything / Debts / Paycheck Budget when `rollover > $0.01`, a
one-tap "Plan $Y" on Paycheck Budget rows (writes an ADR-059 allocation), and a
"Recommended" preset on the Submit/Clear pay dialog. `obligationsInRange` /
left-to-allocate untouched. No schema change.

## ADR-095: Strategy lock + baseline snapshot

Decision:
The debt payoff strategy gets a per-household **lock**. `debt_strategy_settings`
gains six nullable columns (all default `null` = unlocked; unlocked behaviour is
unchanged from today):

| column | meaning |
|---|---|
| `strategy_locked_at timestamptz` | when the plan was locked; `null` = unlocked |
| `locked_strategy text` | `active_strategy` frozen at lock |
| `locked_extra_monthly_payment numeric` | `extra_monthly_payment` frozen at lock |
| `locked_priority_order jsonb` | array of debt-id strings — the Custom order frozen at lock |
| `baseline_debt_free_date date` | first-of-month of the projected payoff month, from `simulate(lockedInputs, balancesAtLock)` |
| `baseline_total_interest numeric` | projected total interest at lock |

1. **Lock** (Debt Strategy screen) writes all six from the current saved inputs
   plus one fresh `simulate()` run. Strategy must be saved first.
2. **Hard lock.** While `strategy_locked_at` is set, the strategy picker, the
   extra-payment field, "Save strategy", and the Custom payoff-order reorder card
   are disabled on the Debt Strategy screen. An **Unlock** button (confirm:
   "Unlocking clears your baseline comparison until you lock again") nulls all six
   columns.
3. **Re-lock overwrites** all six with a fresh snapshot — you only ever compare
   against your most recent decision.
4. **Scoreboard.** While locked, every projection consumer recomputes live using
   the *locked* inputs against *current* balances and compares:
   - live projected debt-free date vs `baseline_debt_free_date` → "On track" /
     "N mo ahead" / "N mo behind"
   - live total interest vs `baseline_total_interest`

   Shown on the **Debt Strategy screen** (full baseline card), the **Dashboard**
   Payoff Progress card (one line), and the **Payment Schedule** screen (a
   "plan locked to <strategy>" banner; the schedule renders the locked strategy
   and its own strategy-preview controls are hidden while locked).
5. **A debt added while locked** is appended to `locked_priority_order` and joins
   the live projection; the baseline scalars are never retro-adjusted (reality
   changed — that is the point of the scoreboard). A live sim that hits the
   600-month cap (`incomplete`) shows "—", not a delta.
6. New `src/lib/strategy-lock.ts`: `lockedInputs(settings)`,
   `baselineComparison(settings, debts)` → `{ status, monthsDelta, interestDelta,
   baselineDate, liveDate }`, `debtFreeDateFrom(months, from?)`. `useLockStrategy()`
   / `useUnlockStrategy()` hooks extend `useSaveDebtStrategySettings`'s upsert.
7. Paycheck-deduction debts stay in the projection (ADR-032 unchanged); biweekly
   minimums stay monthly-equivalent (ADR-094 PR1) — the sim remains a
   calendar-month grid.

`debt_strategy_settings` RLS is already household-scoped and the app already
UPDATEs the row (`useSaveDebtStrategySettings`); the new columns need no policy
change.

Reason:
The strategy screen is a live calculator with no memory — every knob touch moves
the debt-free date and nothing records "this is the plan I committed to." A lock
freezes the inputs so the projection has a stable reference; a two-scalar
baseline turns the screen into an ahead/behind scoreboard without the cost and
staleness of storing a whole month-by-month plan (rejected — see the interview).
ADR-015 forbids stored projections; `baseline_debt_free_date` /
`baseline_total_interest` are a deliberate, bounded exception — a historical
record of one decision, displayed only, never read back into engine math.

Status: Decided 2026-09-03. Implemented 2026-09-03 — migration
`scripts/migrations/2026-09-03-strategy-lock-baseline.sql` run + verified live
(6 nullable columns on `debt_strategy_settings`). `src/lib/strategy-lock.ts`
(`lockedInputs` / `computeBaseline` / `baselineComparison` / `applyLockedOrder`
/ `comparisonLabel` + date helpers), `useLockStrategy` / `useUnlockStrategy`
hooks, Lock/Unlock + baseline scoreboard on the Debt Strategy screen (controls
disabled while locked), a "Locked plan" line on the Dashboard Payoff Progress
card, and the Payment Schedule screen following the locked strategy/order.
`src/lib/debt-recommended.ts` (ADR-094 PR3) also projects from the frozen
inputs while locked. `src/lib/strategy-lock.test.ts` (14 tests). ADR-094 PR4.

## ADR-096: Dashboard Simple / More Info Toggle
Decision:
The Dashboard gains a Simple/More Info toggle (`Switch`, remembered per
device in `localStorage`) beneath the Combined Spendable hero. "More Info" is
the existing Dashboard, unchanged, wrapped in a conditional. "Simple" is a
condensed per-pay-period summary: Income this period (every income event in
range, all sources, `inRange`/`eventAmount` from `paycheck-budget.ts`),
Spendable (existing `spendable.total`), Bills/Debts (`periodTotals.bills`/
`.debts` — total due this period — plus paid so far / pending / overdue),
and Spend (budgeted vs. spent, broken into 11 categories groups, reusing the
existing `BudgetTotals`/`BudgetTile`/`BudgetSplitLines` components unchanged
by feeding them a differently-grouped `BudgetGroup[]`).

"Paid so far" / "pending" per bill/debt come from `deriveCycleInfo` (ADR-036)
— the same ledger-derived state used everywhere else in the app, not the
stored `cycle_paid_to_date` column, so it can legitimately read $0 paid on an
item the "Still owed this period" card (which uses the stored column) shows
as partially paid, when a payment predates the cycle's current due-date
window (ADR-085's documented stored-vs-derived divergence — not new to this
feature). "Overdue" reuses the existing household-wide Past Due figure
(ADR-049), filtered by kind — a different scope than "due this period," so
the three sub-figures aren't guaranteed to sum to the total.

The Spend section's 11 groups (Food, Fun, Green, Kitten, Car, Home & Garden,
Personal, Pets, Puff, Savings, Misc) are a new mapping
(`SIMPLE_SPEND_GROUP`, `src/routes/app.index.tsx`), independent of
`categories.parent_category` — a category not listed falls to Misc. Confirmed
with the user: two categories keep their existing `parent_category` grouping
rather than the user's literal wording (Software & Tech → Fun, with its
Entertainment siblings; Shopping → Misc, with its Misc siblings); every other
grouping is a deliberate finer split than `parent_category` (e.g. Green and
Kitten get their own buckets despite sharing a DB parent with Health/Personal
categories).
Reason:
The full Dashboard has grown into ten-plus cards; a quick-glance mode was
requested for a per-paycheck at-a-glance view without navigating away. Reusing
`BudgetTile`/`BudgetTotals`/`BudgetSplitLines` for the Spend section means the
Simple view's category tiles get tap-to-expand transaction drill-down for
free. The category-group mapping is a real, non-obvious business decision
(not derivable from any existing field), hence its own ADR rather than a
SESSION.md-only note.
Status: Decided 2026-09-04. Implemented — `src/routes/app.index.tsx` only, no
schema change, no new files.

Addendum (2026-09-04): **refinement pass after first use.** Toggle enlarged
(`scale-125` switch, `text-base` labels, clickable labels) and the redundant
"Spendable" row dropped from the Income card (the hero above already shows
Combined Spendable). `StatusBreakdownCard` (Bills/Debts) gained a colored
header band (`color-mix(in oklab, <accent> 15%, transparent)`, matching the
existing `app.more.tsx`/`app.bills.tsx` tint convention) with an icon and a
bigger/bolder title, an `ItemBar` (paid/pending vs. total, reusing the same
component `BudgetTotals`/`BudgetSplitLines` already use), a new "Remaining"
row (`Total − Paid`, matching `billRemainingOwed`/`debtRemainingOwed`'s
existing definition — pending doesn't reduce it), and a `HelpButton` on
"Overdue" reusing the exact wording already on the Dashboard's Past Due
section.

The Spend section's tiles switched from the shared `BudgetTile` to a new
**`SimpleSpendTile`** — same collapsed ring/header (still spending-only, so
the numbers read correctly with no bills/debts noise), but tapping it shows
an institution-by-institution breakdown of that group's spending this period
instead of `BudgetTile`'s `BudgetSplitLines` (Spending/Bills/Debts split,
pointless here since Simple's groups are spending-only). The breakdown
mirrors `app.spending-by-place.tsx`'s row exactly (logo/icon, name, amount,
proportional share bar), filtering `transactions` to the group's
`categoryIds` within the period and excluding internal transfers via
`internalTransferIds` (ADR-089) — computed inline in the tile, not extracted,
since nothing else needs a category-set + custom-date-range version of
Spending by Place's logic. `BudgetTile` itself is untouched — More Info's
"Budget vs actual" card still uses it unchanged.

Addendum (2026-09-04): **bugfix — the institution breakdown was including
bill/debt payments.** A bill/debt payment transaction can carry the same
`category_id` as a group's spending categories (e.g. a real household's ATT
or Google One bill filed under "Home & Garden" alongside real Home & Garden
spending), and `SimpleSpendTile`'s institution breakdown matched on
`category_id` alone — so it wrongly listed the bill's institution next to
genuine spending places, even though the tile's own total already correctly
excluded that money (via `actualByCategoryInRange`'s `spendingSpent` field).
Fixed by skipping any transaction with `linked_bill_id`/`linked_debt_id` set
in the breakdown loop, mirroring the same distinction
`actualByCategoryInRange` already makes. Reported by the user via a
screenshot (`planning/image.png`) showing ATT and Google One next to Fred
Meyers under "Home & Garden."

Addendum (2026-09-04): **Income card + pay-period range.** The Income row
moved out of the plain Income/Spendable card into its own card with a
green-tinted header (`color-mix(in oklab, var(--state-cleared) 15%,
transparent)`, same convention as the Bills/Debts `StatusBreakdownCard`
headers), an icon, and a larger `text-2xl` figure — more visually
prominent per the user's request. A new centered line
(`formatWindow(period.start, period.end)`, existing helper from
`src/lib/format.ts`, already used for "Pay period"/"Cycle window" fields
elsewhere) sits between the toggle and the Income card, showing the pay
period's date range (e.g. "Aug 21 – Sep 4, 2026").

## ADR-097: Fees on Transfers (Amends ADR-056, Reuses ADR-046)

Decision:
Add Transaction's Transfer mode gains an optional "Fee" field alongside
Amount. "Amount" stays the clean, symmetric transfer (unchanged from
ADR-056/064: equal negative/positive rows on the from/to accounts, sharing
`transfer_group_id`). "Fee" is an extra amount debited **only** from the
from-account — e.g. a $100 transfer with a $1.75 instant-transfer fee (Venmo
→ a debit card) debits $101.75 from Venmo and credits $100.00 to the
destination.

Implementation reuses ADR-046's bill/debt fee mechanism as-is rather than
inventing a transfer-specific one: `insertFeeTransaction` (generalized to
take a label/institution_id instead of a full `Payable`) writes a third,
unlinked transaction on the from-account, categorized via the same
auto-created household "Fees" category, described `"Fee: <transfer
description or "Transfer">"`. It is paired to the transfer via
`split_group_id = <the transfer's group id>` — the same UUID already used
for `transfer_group_id` on the two legs, just carried in the fee row's
`split_group_id` column instead. The fee row's own `transfer_group_id` is
left null.

This pairing choice matters: `TransactionDetail`'s `transferPair` lookup
(`app.transactions.tsx`) finds "the other leg" by matching
`transfer_group_id` and expects exactly one row back, and `internalTransferIds`
(ADR-089, `internal-transfers.ts`) classifies a `transfer_group_id` as
"internal" (excluded from spending) whenever it sees both a negative and a
positive leg. Tagging the fee row with `transfer_group_id` instead of
`split_group_id` would have broken both: a third row in the pair breaks the
"exactly one other leg" assumption, and a fee is real spending that must NOT
be excluded the way the two-sided transfer itself is. Keeping it on
`split_group_id` only means the fee behaves exactly like an ADR-046 fee row:
a normal, categorized, one-sided transaction that counts as spend — reusing
`deletePairedFees` so deleting the transfer pair (`useDeleteTransferPair`)
also removes its fee.

Known cosmetic wart: because the fee is the only row carrying that
`split_group_id`, the ledger list's grouping helper (`groupLedgerRows` in
`split-groups.ts`) shows it as a one-line "Split · 1 categories" card with a
"Show breakdown" toggle, rather than a plain transaction card. Functionally
harmless (verified: the detail view shows the fee correctly, deleting it
works normally) — not fixed here since `groupLedgerRows` is shared by every
split/paycheck/payment-with-fees display and changing its size-1 handling is
out of this change's scope.

Bugfix surfaced along the way: `feeCategoryId()` (ADR-046) auto-creates the
household's "Fees" category on first use but never set `domain`, which is
NOT NULL on the live `categories` table (docs/SCHEMA.md previously
undersold this as nullable) — any household without a pre-existing "Fees"
category (verified against the TEST household) hit a DB error the first
time a fee was entered. Fixed by setting `domain: "spending"` on that
insert, consistent with a fee being real spending.

Reason:
The app already solved "a fee rides along a clean amount, debited from the
same account, without corrupting that clean amount's own math" for bill/debt
payments (ADR-046). A transfer fee is the identical shape — Venmo's instant-
transfer fee is real money that left the source account but isn't part of
the amount that actually reached the destination. Reusing the mechanism
verbatim (generalizing one helper's parameter) avoided a second, parallel
fee implementation.

Status: Decided 2026-09-08. Implemented 2026-09-08. Verified end-to-end
against the TEST household (ADR-083): write produces the expected 3-row
shape with correct amounts/category, `internalTransferIds` correctly leaves
the fee out of the excluded set, and deleting the transfer via the UI
cascades to remove all 3 rows.

**2026-09-08 addendum — cosmetic-wart fix, and editing a prior transfer's fee:**

1. **Fixed the "Split · 1 categories" wart.** The root cause was broader than
   display: any `split_group_id` shared by exactly one row (not just a
   transfer fee — any orphaned/solo one) was misclassified as a genuine
   split everywhere it was checked.
   - `groupLedgerRows` (`split-groups.ts`, used by every ledger list —
     transactions, accounts, pending) now precomputes each `split_group_id`'s
     row count first; a size-1 group is emitted exactly like an ungrouped row
     (`isSplit: false`, keyed by its own transaction id) instead of always
     defaulting a non-null `split_group_id` to `isSplit: true`.
   - `TransactionDetail` (`app.transactions.tsx`) had the same bug one layer
     deeper: its `isCategorySplitGroup`/`isPaycheckDeposit` checks required
     only `groupRows.length > 0`, so a solo fee row's `classifyLedgerGroup`
     fell through to the "category-split" default and opened the whole-group
     `SplitTransactionDetail` editor. Both guards now require `length > 1`.
     A related knock-on: the plain single-row edit form hid Category/Place
     for "paycheck deposit rows carry no category by design" using
     `!transaction.split_group_id` as the proxy — too broad now that a solo
     fee row also carries a `split_group_id` but does need those fields.
     Re-gated on `!isPaycheckDeposit` specifically.
   - Covered by new tests in `split-groups.test.ts` (solo split_group_id →
     not split; a real split group and an unrelated solo row classified
     independently) and unaffected: the existing paycheck/category-split/
     payment-with-fees tests all still pass unchanged.

2. **Editing a transfer's fee after the fact.** A transfer's own detail view
   (opened from either leg) now shows a "Fee" field alongside From/To, and
   editing that leg (Edit → Fee (optional) → Save) adds, changes, or removes
   the paired fee row — not just at creation time via Add Transaction. New
   `useSetTransferFee` (`data-hooks.ts`) does the insert/update/delete:
   insert reuses `insertFeeTransaction` when no fee row exists yet, a plain
   `amount` update when one does, and a delete when the field is cleared.
   The fee always attributes to the transfer's **from**-account regardless of
   which leg is currently open (resolved the same way `transferFromAccount`
   already is, by amount sign). A pre-existing fee row is also just a plain
   transaction now (per the wart fix above) and can be edited/deleted
   directly like any other transaction — the new "Fee" field on the transfer
   itself is for households whose transfer predates this feature, or who
   skipped the fee at entry time and want to add it later.

   Verified against the TEST household: seeded a fee-less transfer directly,
   added a $2.50 fee via the to-leg's edit form (confirmed it landed on the
   from-account, not the leg being edited), reloaded and confirmed the fee
   row renders as a plain card, opened the fee row directly and confirmed
   Category is editable, then cleared the fee via the from-leg's edit form
   and confirmed the fee row was deleted while both transfer legs were
   untouched.

2026-09-09 addendum — fee row links back to its transfer:
The 2026-09-08 addendum above made `TransactionDetail`'s transfer leg show
its paired fee (`transferFeeRow`, via `split_group_id === transfer_group_id`).
The reverse direction was still missing: opening the fee row itself showed a
plain single-account transaction with no indication it belonged to a
transfer at all. Fixed with the mirror-image lookup — `linkedTransferLeg`
finds a row whose `transfer_group_id` equals this row's own `split_group_id`
(only attempted when this row isn't itself a transfer leg), resolves both
account names the same way `transferFromAccount`/`transferToAccount` already
do, and renders a "Transfer" `DetailItem` in the same slot the plain
"Account" item would otherwise occupy. It's a clickable link (new optional
`onOpenTransaction` prop on `TransactionDetail`, wired at its one call site
in `app.transactions.tsx` to `setDetail`) that opens that transfer leg's own
detail view in place. No schema change; no change to the bill/debt payment-
fee shape (ADR-046), which was already bidirectionally visible as a real
2-row `split_group_id` group via `groupLedgerRows`/`isPaymentWithFeesGroup`.

Status: Decided 2026-09-09. Implemented 2026-09-09.

## ADR-098: Transfer Transaction Titles Show Source -> Destination

Decision:
Either leg of a transfer (`transactions.transfer_group_id` set, ADR-056) titles itself
`"<Source account> → <Destination account>"` instead of falling back to generic
"Transaction" text or showing only whatever manual description was typed. This always
wins over the normal place-based title (ADR-053/063) for a transfer row. Any manual
description (e.g. "Xfer to Steph") is kept, rendered as the same small italic subtitle
already used for a place's description — nothing the user typed is lost, it just no
longer stands in as the whole title.

Reason:
A transfer's two legs often carry no description at all (nothing to describe — the
"place" is just the other account), which previously rendered as the unhelpful literal
string "Transaction" in both the ledger list and the detail dialog. Source/destination is
the one piece of information that's always true and always useful for a transfer,
regardless of whether a description was entered.

Implementation: `TransactionTitle` (`src/components/TransactionTitle.tsx`) gains two
optional props, `transferFromAccount`/`transferToAccount`; when both are present and
`transaction.transfer_group_id` is set, it renders the arrow format ahead of every other
branch. The two callers resolve the names differently since they have different data in
hand: `TransactionDetail` (`app.transactions.tsx`) already computes
`transferFromAccount`/`transferToAccount` for its own From/To detail items and just passes
them through; the ledger list builds a one-time memoized map
(`transferTitleAccounts`, keyed by transaction id) from the full transaction list instead
of an O(n) lookup per row. `src/routes/app.accounts.tsx`'s two per-account transaction
lists (`AccountAllTransactions`, `RecentActivity`) are NOT wired up — they only receive a
single account's `rows`, not the full cross-account transaction list needed to find the
other leg, and already show a "Transfer" badge next to the amount as a weaker signal.
Revisit if that gap turns out to matter in practice.

Status: Decided 2026-09-09. Implemented 2026-09-09.

Addendum (2026-09-11): the Accounts & Balances gap above did turn out to matter — wired
up. `AccountsPage` (`app.accounts.tsx`) now builds the same `transferTitleAccounts` map
(keyed off its own already-fetched full `useTransactions()` list, same shape as the
Transactions screen's) and threads it through `RecentActivity`, `AccountAllTransactions`,
and the `AccountDetailDialog` that hosts the latter. All three transfer legs now render
"Source → Destination" regardless of which screen they're viewed from. No data change —
this is purely a rendering gap; every existing `transfer_group_id` pair already had both
legs in the database. Verified in-browser (Playwright against a throwaway TEST-household
account + transfer pair, cleaned up after): both `RECENT ACTIVITY` and `ALL TRANSACTIONS`
on the Accounts screen now show the arrow, matching the Transactions screen. Status:
Implemented 2026-09-11.

## ADR-099: Institution Type Taxonomy Expansion + Fix Institution Logins Screen

Decision:
Add 13 new `institution_type` values to the client-side allowed list
(`INSTITUTION_TYPES` in `src/components/InstitutionDialog.tsx` — free text, no DB
constraint): `restaurant`, `grocery_store`, `gas_station`, `liquor_store`,
`department_store`, `specialty_store`, `venue`, `game`, `app`, `dispensary`,
`personal_care`, `employer`, `delivery`. Matching icon/color entries added to
`INSTITUTION_TYPE_META` (`src/lib/visual-meta.ts`). Existing institutions previously
typed `other` (or, for UberEats, `subscription`) are reclassified into these where a
clear match exists — see `scripts/migrations/2026-09-09-institution-type-reclass.sql`
for the full per-institution mapping, decided interactively with the user rather than
guessed. A handful of genuinely ambiguous names (Dept of Education, DFAS, Gavora's,
Lacey Miller, MoneyLion, The Sheet Code) are deliberately left as `other`.

Also adds a new "Fix Institution Logins" screen (`/app/fix-institution-logins`),
grouped alongside the existing "Fix Places" screen (`/app/fix-places`) in the More
page's icon grid (`src/routes/app.more.tsx`) — there is no nested "Fix" submenu, both
just sit in the same flat list. It lists every institution with no `login_url` and lets
the user fix it in place with an inline URL field, same shape as `FixPlacesPage`.

Reason:
`other` had become a catch-all for roughly half the household's ~130 institutions —
restaurants, grocery/gas/liquor stores, apps, a dispensary, a barbershop, an employer,
and delivery platforms were all indistinguishable in filters and reports. `delivery` is
deliberately a business-kind classification, independent of whether a given UberEats
transaction is the household's driving income or its occasional dining spend — that
split is already handled by category/domain and amount sign (ADR-069), not
institution_type, so one type serves both directions cleanly. Institutions missing a
login_url had no dedicated fix flow, unlike the equivalent gap already solved for
transactions without a place (ADR-053/063's Fix Places).

Status: Decided 2026-09-09. Implemented 2026-09-09 (code). Data reclassification SQL
written, pending the user running it manually per ADR-083.

Correction (same day): the reclassification migration failed —
`institutions.institution_type` turned out to be DB-enforced via a check
constraint (`institutions_institution_type_check`), scoped to exactly the
original 9 values. Both this ADR's Decision text above and
`INSTITUTION_TYPES`'s own comment in `InstitutionDialog.tsx` incorrectly
stated there was no DB constraint — never verified against the live schema
before writing the migration, same category of doc drift as ADR-097's
`categories.domain` correction. Fixed with a schema migration,
`scripts/migrations/2026-09-09-institution-type-check-constraint.sql`
(drops and recreates the constraint with all 22 values), which must run
**before** the reclassification migration. The failed reclass attempt's
transaction rolled back cleanly — verified live via MCP that 0 institutions
ended up outside the original 9 values, so no partial/corrupt state resulted.
`docs/SCHEMA.md`'s institutions section updated to document the constraint.

## ADR-100: Transactions Gain a Second Date — cleared_date

Decision:
Add `transactions.cleared_date date` (nullable). `transaction_date` keeps its
existing meaning — when the transaction was logged/initiated/submitted — and is
never auto-changed by a later status transition. `cleared_date` is the date it
actually posted at the bank, matching what a bank statement would show:

- Set automatically equal to the entered date whenever a row is written
  directly with `status: 'cleared'` (manual cleared entries, transfers,
  splits, reversals, corrections, historical logged payments) — no extra
  prompt, since there's only one real date in play.
- Explicitly prompted for (defaulting to **today**, editable) specifically at
  the **pending → cleared transition** — the one moment "today" is genuinely
  different information from the row's original `transaction_date`.

Every existing `cleared` row is backfilled (`cleared_date = transaction_date`)
by the same migration that adds the column, so the field is reliably non-null
for every cleared row going forward.

`src/lib/balances.ts` (`computeBalances`) and `src/lib/net-worth.ts`
(`balanceAsOf`) both switch their anchor-date comparison for cleared
transactions from `transaction_date` to `cleared_date` (defensive `??
transaction_date` fallback kept, not expected to be load-bearing post-backfill).
Pending transactions are unaffected — they have no `cleared_date` by
definition and stay compared on `transaction_date`, their only meaningful date.

The pending→cleared UI surfaces gained a "Cleared date" input:
- `src/lib/pay-flow.tsx`'s `tap()` — clearing an already-pending bill/debt
  payment (the main checkbox tap on Bills/Debts/Everything) was previously
  instant with no dialog at all; it now shows a small confirm dialog with just
  the date (defaulting to today) before clearing, for both the known-account
  path and the unknown-account/picker fallback.
- `src/routes/app.pending.tsx`'s existing "Mark cleared?" confirm dialog
  gained the same date input inline — no new dialog needed there, it already
  stopped for confirmation.
- `TransactionDetail`/`SplitTransactionDetail`/`LinkedGroupDetail`
  (`app.transactions.tsx`) each gained a "Cleared date" field next to Status,
  shown only when `status === "cleared"`, so the date can also be corrected
  after the fact — not just picked once at clear time.
- The ledger list row and per-account activity lists (`app.transactions.tsx`,
  `app.accounts.tsx`) show `cleared_date` alongside `transaction_date` only
  when it's set **and differs** — showing the same date twice is just noise.

Explicitly NOT changed: `src/lib/ledger-state.ts`'s `deriveCycleInfo()` cycle-
window attribution stays on `transaction_date` — which cycle a bill/debt
payment resolves should reflect when it was recorded/submitted against that
cycle, not whenever the bank happened to post it days later; switching this
risked a payment submitted before a due date but clearing after it slipping
into the wrong cycle. `resolved_cycle_due_date` (ADR-075) already exists as
the deliberate override for edge cases here. Dashboard pay-period/month
bucketing and Spending's month grouping also stay on `transaction_date`, for
the same reason — budgeting tracks when you committed to spending, not when
the bank got around to posting it.

Reason:
Reconciling the ledger against real bank/Venmo statements (recurring work this
session) kept hitting the same friction: a transaction logged `pending` one day
often doesn't clear until days later, and a bank statement only ever shows the
posted date. Verified live in `useMarkCleared` before this change: marking an
already-pending transaction cleared only flipped `status` — `transaction_date`
was never touched, so a payment submitted 9/9 and cleared 9/12 kept showing 9/9
forever with no record anywhere of 9/12.

Status: Decided 2026-09-09. Implemented 2026-09-09. Migration
`scripts/migrations/2026-09-09-transactions-cleared-date.sql` (+ `.verify.sql`)
written, pending the user running it manually per ADR-083.

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

Status: Decided 2026-09-11. Implemented 2026-09-11; extended 2026-09-15.

## ADR-103: Cash Tracking via a Cash Account + "Cash Back" Combo Entries

Decision:
A blended register swipe — part purchase, part cash back — no longer gets entered as a
same-account category split (which counted the cash-back portion as spend the moment it
was withdrawn). Instead:
- Each household member gets their own `accounts` row, `account_type = 'cash'`, no
  institution, `owner_member_id` set to that member (not joint) — plain data, no schema
  change (`account_type` carries no DB check constraint, unlike `institution_type`,
  ADR-099).
- A new "Cash Back" entry mode (`AddTransactionFab.tsx`) writes: (1) a normal ADR-056
  transfer pair (checking `-cashAmount` / Cash `+cashAmount`, `transfer_group_id =
  groupId`), and (2) one or more categorized purchase rows on the checking account,
  `split_group_id = groupId` — the same id as the transfer. This generalizes ADR-097's
  single fixed-category fee row to N caller-categorized lines (`insertCashBackPurchaseRows`
  in `payments.ts`, a sibling of `insertFeeTransaction`); `useSaveCashBack` in
  `data-hooks.ts` writes both parts. A pure cash withdrawal (no purchase attached) needs
  no new code — it's already just a plain Transfer.
- `classifyLedgerGroup`/`isCategorySplitGroup` (`split-groups.ts`) take a new
  `transferGroupIds` set; a `split_group_id` that is also some transfer's
  `transfer_group_id` classifies as `"cash-back-purchase"`, never `"category-split"` —
  otherwise a 2+-line purchase would wrongly open the whole-group split editor, which
  doesn't know about the paired transfer. Falling through to the plain per-row editor
  means the existing `linkedTransferLeg` lookup (already used for fee rows) shows the
  "part of a transfer" banner for free — no new detail-view UI needed.
- `useDeleteTransferPair` now deletes every row sharing the transfer's group id via
  either column (`split_group_id` or `transfer_group_id`) instead of only rows matching
  `description ILIKE 'Fee:%'` — a plain superset, since a transfer's `transfer_group_id`
  is only ever handed to `insertFeeTransaction` or `insertCashBackPurchaseRows`, never to
  a bill/debt payment+fee group (those use their own, unrelated group id).
- `balances.ts`'s `SPENDABLE_TYPES` gains `"cash"` — found live, no `cash`-type account
  existed yet, but the allowlist would have silently excluded one from the spendable-money
  total despite `is_spendable = true`.
- No reconciliation/"count my cash" feature: the Cash account balance is just
  `starting_balance + transactions`, same as every other account. Drift from untracked
  cash spending is tolerated for now.
- The pre-existing "Cash & Checks" category (2 transactions, $60 total, 2026-07-02) is
  retired for new entries; those 2 rows are left as-is (Issue to follow for migrating
  them). "Checks" as a concept is untouched — a different timing problem, out of scope.

Reason:
The user's own example: buy a snack at Fred's, get $100 cash back in the same swipe,
entered as a split with the cash portion categorized "Cash & Checks" — counted as $100
of spend immediately. Later spending that cash (e.g. $50 on weed, $50 on a movie), logged
as its own categorized transaction, counted the same $100 again. Giving cash a real
account turns the withdrawal into a transfer (excluded from spend by the existing
ADR-089 `internalTransferIds` logic, no change needed there) and the later spending into
an ordinary transaction that counts once. A dedicated combo entry (rather than teaching
the generic split editor to target a second account) keeps the existing
one-account-per-split-group invariant intact — `assertCategorySplitGroup`'s guard and the
whole-group edit/delete path are unchanged.

Verified live via the read-only Supabase MCP (project `ilxwhgqudcxsgxrvxhtb`) before
building: no `cash`-type account existed yet; `account_type` has no DB check constraint;
"Cash & Checks" is a real `spending`-domain category with exactly 2 transactions.

Not covered: no bespoke "edit the whole Cash Back entry as one form" UI — each row (2
transfer legs + N purchase lines) is edited individually through the existing per-row
editor, same as a transfer's optional fee already works. The main ledger list still badges
a multi-line Cash Back purchase as a generic "Split · N categories" card (only the detail
view's editor routing was fixed) — cosmetic, not a follow-up Issue yet.

Status: Decided 2026-09-13. Implemented 2026-09-13.


## ADR-104: Tags — Many-to-Many Labels on Transactions (and Split Lines)

Decision:
Add a free-form tagging system: a `tags` table (household-scoped, name +
optional icon/color, ADR-029 convention) and a `transaction_tags` join table
(`transaction_id`, `tag_id`, composite PK, both FKs `on delete cascade`) —
the exact shape ADR-005 already established for `institution_categories`.
A tag can be applied to any transaction, including one specific line of a
multi-line split (each split line is already its own row in `transactions`
sharing `split_group_id`, so no new sub-row concept is needed — tagging a
line is just a `transaction_tags` row against that line's own id). A
transaction/line may carry any number of tags (chip multi-select, not a
single dropdown). A new `/app/tags` screen shows a running total + linked
transaction list per tag, and lets a tag be created/edited/deleted.

Tags are pure labels for v1 — no budget/target amount. That can be added to
the `tags` table later (e.g. a nullable `target_amount` column) without
reshaping this schema.

Reason:
User's motivating case: tracking a one-off cost (a friend's wedding dry
cleaning) that doesn't fit the existing category model — the expense is
legitimately "Dry Cleaning" by category, but the user also wants to see it
(and everything else tied to that event) totaled together. The same
mechanism generalizes to tax-deductible tracking, medical-expense tracking,
and per-trip spend — all cases where a transaction belongs to a real
spending category AND a cross-cutting label, and a single FK can't hold
both. Splits need line-level tagging specifically because a single register
swipe can mix a tagged purchase (e.g. wedding ribbon) with an untagged one
(a snack) in the same transaction.

`institution_categories` (ADR-005) already proved this exact many-to-many
join-table shape works well in this codebase for "one thing can have several
of another thing" — reused rather than inventing a new pattern. Scoping
`transaction_tags` reads by the household's own (small) `tag_id` list rather
than by a potentially-large `transaction_id` list avoids the row-limit class
of bug just fixed in `useTransactions()` this same session (PostgREST's
default 1000-row cap on an unpaginated select).

`useSaveSplitTransaction` deletes and re-inserts every line of a split on
every edit (the same mechanism that silently dropped `institution_id` on
split edits before the 2026-09-13 fix) — tag ids are re-attached by the
split editor on every save using each line's *current* tag selection
(seeded from the existing rows when the edit form opens), so an edit never
silently drops previously-applied tags.

Status: Decided 2026-09-15. Implemented 2026-09-15.

ADR-104 addendum (2026-09-17) — tagging extended to Transfer and Cash Back creation:

Decision:
Tags were only wired into the Add Transaction dialog's shared expense/
income/split branch — the "Transfer" and "Cash Back" modes each have their
own JSX branch in `AddTransactionFab.tsx` and never reached the `TagPicker`,
so neither could be tagged at creation at all (not a deliberate exclusion,
just missing). Fixed for both, with the granularity interviewed rather than
guessed:

1. **Transfer**: one `TagPicker` for the pair, applied to BOTH legs —
   a transfer is conceptually one movement, so a tag search finds it
   regardless of which leg (or account) it's looked at from.
   `useSaveTransfer` (`src/lib/data-hooks.ts`) takes an optional
   `tagIds?: string[]`, writes `transaction_tags` rows against both
   inserted legs' ids once they exist (a plain insert, not the diffing
   `useSetTransactionTags` does, since these are brand-new rows with
   nothing to diff against).
2. **Cash Back**: tags apply to the categorized purchase line(s) only —
   the withdrawal-to-Cash leg itself stays untagged, matching how it's
   already excluded from spend totals as an internal transfer (ADR-089).
   `cbPurchaseRows` already reused `SplitLinesEditor`/`SplitRow`
   (`tagIds` per line, ADR-104's own split-line tagging), so the picker
   was already on screen — `submitCashBack` just wasn't forwarding
   `r.tagIds` into `purchaseLines`. `insertCashBackPurchaseRows`
   (`src/lib/payments.ts`) now `.select("id")`s the inserted purchase
   rows and attaches each line's tags by index, the same
   insert-then-correlate pattern `useSaveSplitTransaction` already uses.

Reason:
Interviewed rather than assumed: a transfer's two legs are one user-facing
event, so splitting the tag between them would make a tag-based search miss
half of it depending on which account you're looking from. A Cash Back
withdrawal leg is deliberately excluded from spend already (ADR-089) — most
tag use cases are spend-tracking (tax-deductible, per-trip, etc.), so
tagging the never-spend withdrawal leg too would double-count it whenever a
tag's total is summed by transaction.

Status: Decided 2026-09-17. Implemented 2026-09-17.

## ADR-105: Cross-Entity Navigation via `?open=<id>` Search Params; Global Dialogs Gain External Presets

Decision:
Two small, related conventions, both new to this app (SCRATCHPAD "Next
Steps"):

1. **Deep-linking to another route's detail dialog.** A route that owns a
   detail dialog (so far: `/app/accounts`, `/app/debts`) declares
   `validateSearch` returning `{ open?: string }` (an entity id). On mount,
   an effect looks up that id in the already-loaded list and opens the
   dialog exactly as a card-tap would, then immediately clears the param
   via `navigate({ search: {}, replace: true })` so back/refresh doesn't
   re-trigger it. A caller anywhere else navigates via
   `navigate({ to: "/app/accounts", search: { open: accountId } })`. No
   route previously had `validateSearch`/`useSearch` at all — every
   "detail" view before this was a local `useState` + `Dialog` scoped to
   its own route file with no way to reach it from elsewhere. First use:
   a linked credit-card debt's "Account" field and an account's reverse
   "Linked debt" field are now clickable, navigating each direction.
2. **A global singleton dialog accepting an external preset.**
   `AddTransactionFab` (mounted once in `app.tsx`, used app-wide) had no
   way to be pre-filled — opening it from an Account or Institution detail
   required closing that dialog and manually reselecting the account/place
   in the Add Transaction form. `AddTransactionPresetProvider`
   (`src/components/AddTransactionPreset.tsx`) wraps the app shell and
   owns the FAB's open state plus an optional `{ accountId?,
   institutionId? }` preset; `useAddTransactionPreset().openWithPreset(...)`
   lets any component reachable inside the provider open it pre-filled.
   `AddTransactionFab` seeds `accountId`/`merchantId` from the preset in an
   effect keyed on `open`, on top of its existing `reset()` defaults.

Reason:
Both are the first instance of a real need this app hadn't hit before —
jumping to a specific other entity's detail, and pre-filling a
globally-mounted dialog from a page it isn't rendered on. Search params are
the natural TanStack Router mechanism for "this route, but with one thing
already open" (doesn't fight the router's own history/back behavior the
way an ad-hoc global "which dialog is open" store would); a lightweight
context is the natural mechanism for a true singleton that already lives
above every route (a route-level solution can't reach a component mounted
once in the shared shell). Documented so a third cross-entity link (there
will be more) reuses the `open=` convention instead of inventing another
one, and so another globally-mounted dialog reuses the preset-context shape
instead of hand-rolling props-drilling that can't reach it from a
different route.

Also fixed alongside this: `DebtDetailDialog`'s "Account" field was
resolving the shown account by matching `institution_id`, not the actual
`linked_account_id` (ADR-102) — harmless before a credit-card debt could
be linked, silently wrong once it could be. Now resolves via
`linked_account_id` first, falling back to the old `institution_id` match
only for a debt that isn't linked.

Status: Decided 2026-09-16. Implemented 2026-09-16.

## ADR-106: Institution Links, Per-Member Accounts, Institution Parent/Child, Bill Active Toggle

Decision:
Four related additions to how institutions/bills/debts model real-world
complexity, interviewed and decided together (surfaced while setting up
"Yukon Eye" and noticing Amazon/Prime were unrelated institutions):

1. **Multiple links per institution** (`institution_links`: `id,
   institution_id, kind, label, url, sort_order, created_at,
   updated_at`). `institutions.login_url` stays exactly as-is ("Main
   site"); this table only holds *additional* named links. `kind` is a
   DB-checked enum (`bill_pay` / `patient_portal` / `other`) rather than
   free text, because the Log In button and the Patient-Portal-for-medical
   gating both need to find "the" link of a given kind reliably — free
   text label matching would be fragile. No `household_id` column;
   scoped through `institution_id`, same as `institution_categories`
   already does. `InstitutionLoginButton` now opens
   `links.find(l => l.kind === "bill_pay")?.url ?? institution.login_url`
   (falls back to the main site when no Bill Pay link is set) and renders
   one additional button per other stored link (Patient Portal, any
   custom "Other" links). "Patient Portal" is only offered as a kind
   choice in the institution form when `institution_type === "medical"`
   — UI-side gating only, not a DB constraint (matches how other
   type-gated UI already works here).
2. **Per-member accounts at an institution**
   (`institution_member_accounts`: `id, institution_id, member_id,
   account_number, login_username, notes, created_at, updated_at`,
   unique `(institution_id, member_id)`) — for providers that bill each
   spouse separately (vs. providers that combine visits into one joint
   invoice, which need no new concept at all). `bills` and `debts` each
   gain a nullable `institution_member_account_id` FK, coexisting with
   the existing (unchanged, still required) `institution_id` — an
   optional overlay, same shape as `accounts.owner_member_id` (ADR-088),
   not a replacement of the institution relationship.
3. **Institution parent/child** (`institutions.parent_institution_id`,
   nullable, `on delete set null`) — so Prime/Kindle/Audible can be
   marked as part of Amazon without merging their existing data. Kept to
   2 levels (parent + children, no grandchildren) by only offering
   institutions with no parent of their own as parent choices in the
   form — no recursive-chain validation needed. `computeInstitutionTotals`
   (`src/lib/balances.ts`) now takes the full `institutions` list so a
   parent's total includes every child's accounts/bills/debts alongside
   its own. Child institutions drop out of the top-level Institutions
   list (their money is now counted under the parent — showing both
   would double-count any grand total) but stay fully reachable via the
   parent's detail view and via any bill/debt that still names its real
   institution directly.
4. **Bill active/inactive toggle** — `bills.is_active` already existed
   in the database and was already read in 4 places
   (`computeInstitutionTotals`, `paycheck-budget.ts`, `snapshot.ts`,
   `spending-actuals.ts`) but had no write path anywhere. Added a
   `Switch` to `BillDialog`, copying `AutoTransferDialog`'s existing
   "Active" pattern exactly (including the list row's `opacity-60`
   dim-when-inactive treatment, already established there). A plain
   boolean was kept rather than adding a paused/cancelled/active
   three-state enum — nothing downstream needs to distinguish "paused,
   will resume" from "cancelled for good" today.

Reason:
Each gap was blocking a real, current use case (Yukon Eye's separate
Bill Pay/Patient Portal sites, spouses' separate invoices at shared
providers, Amazon's family of sub-institutions, and a bill that's
actually been cancelled still counting toward totals). All four were
interviewed and scoped to the smallest structure that solves the real
case in front of us rather than a maximally general one: a fixed 3-kind
enum instead of arbitrary link types, a flat member-account overlay
instead of a deeper ownership model, 2-level parent/child instead of
arbitrary nesting, and a boolean instead of a status enum. `bills`/
`debts` already supported many-to-one against `institutions` in
practice (`computeInstitutionTotals` already `.filter()`s, never
`.find()`s), so the member-account and parent/child additions extend an
existing shape rather than introducing a new one.

Status: Decided 2026-09-16. Implemented 2026-09-16.

ADR-106 addendum (2026-09-17) — merge over parent/child; member-primary
detail grouping:

Decision:
First real use of ADR-106 surfaced two refinements, both interviewed with
the user rather than assumed:

1. **Merge a split-by-spouse institution into one, don't parent/child it.**
   The user had 3 real institutions modeled as duplicate pairs (Labcorp,
   Alpine Medical, Planet Fitness, each split "- Steven"/"- Stephanie" or
   "- Me"/"- You") purely because there was previously no other way to
   represent per-spouse billing. Checked live: within every pair,
   `login_url`/`logo_url`/`description`/`notes` were identical — the only
   difference was `login_username`, exactly what
   `institution_member_accounts.login_username` now holds. Rather than
   using the new parent/child rollup for this case, each pair is merged
   into a single institution (`scripts/migrations/2026-09-17-merge-split-institutions.sql`):
   two new `institution_member_accounts` rows (Steven/Stephanie) under the
   surviving institution id, every existing bill/debt re-pointed/tagged to
   it, every `transactions.institution_id` "place" reference re-pointed
   too (the losing institution otherwise can't be deleted — a live FK),
   the losing institution deleted. Parent/child stays reserved for
   genuinely distinct institutions that happen to be commercially related
   (Amazon/Prime) — not a second way to express "this is the same place,
   split by who it belongs to," which member-tagging already owns.
2. **Institution detail's member grouping is member-primary, not
   kind-primary.** The original ADR-106 implementation grouped *within*
   separate "Bills" and "Debts" sections by member, with no subtotal. The
   user's actual want was the reverse: one section per person, their
   bills and debts together, one combined total — e.g. Alpine Medical
   showing a "Steven" section (his bills + debts + total) and a
   "Stephanie" section (hers). `InstitutionDetail`
   (`src/routes/app.institutions.tsx`) restructured accordingly for any
   institution with 2+ member accounts; an institution with 0-1 stays on
   the original flat Bills/Debts layout, unchanged.

Reason:
Both gaps only became visible once ADR-106 met real data. The merge
question mattered because two competing "whose is this" mechanisms
(parent/child and member-tagging) solving the same problem for different
institutions would be a lasting inconsistency, not a one-time cost — worth
fixing before any more institutions are set up either way. The grouping
shape came directly from the user's own description of what they needed
to see, not a guess.

Status: Decided 2026-09-17. Implemented 2026-09-17.

ADR-106 addendum (2026-09-17b) — Log In URL priority: bill_pay > patient_portal > login_url:

Decision:
`InstitutionLoginButton`'s "Log In" now opens the first URL found in
`links.find(bill_pay) -> links.find(patient_portal) -> institution.login_url`,
amending the original bill_pay-then-login_url order from earlier the same
day. Whichever link "Log In" ends up using is no longer also offered as its
own extra button (previously only `bill_pay` was excluded from the extra-
links row; now `patient_portal` is excluded too, but only when it's actually
serving as the login target — if a `bill_pay` link is also set, Patient
Portal still gets shown as its own separate button).

Reason:
Alpine Medical has no dedicated bill-pay link; its billing lives inside its
Patient Portal. Falling straight through to the generic "Main site" login
for Log In was wrong for that case — Patient Portal is a more specific,
still-generic-enough (not per-member) destination than the main site, so it
belongs ahead of it in the fallback order.

Status: Decided 2026-09-17. Implemented 2026-09-17.

## ADR-107: Transfers to an Untracked Personal Account Count as Spend

Decision:
New `accounts.transfers_count_as_spend` (boolean, default `false`). When an
account carries this flag, ADR-089's "two-sided transfer is never spend"
rule no longer applies the same way for a transfer touching it:

- A transfer whose RECEIVING leg lands on a flagged account is no longer
  treated as internal at all — the sending leg (on a normal, tracked
  account) counts as real spend, same as money that actually left the
  household. `internalTransferIds()` (`src/lib/internal-transfers.ts`)
  gained an optional second argument, the set of flagged account ids
  (built by the new `opaqueTransferAccountIds(accounts)` helper), and
  excludes a `transfer_group_id` from its returned "internal" set once the
  positive leg's `account_id` is in that set.
- The reverse direction — a transfer whose SENDING leg is the flagged
  account, i.e. money coming back — deliberately stays a neutral, excluded
  internal transfer for now, not "income." Every spend calculator in this
  codebase only ever recognizes negative amounts as spend; none has an
  "income" counterpart a transfer leg could feed into without a genuinely
  new feature. Treating the reverse leg as spend too (the naive symmetric
  option) would have been actively wrong — money coming back isn't an
  expense. Properly crediting it as income is deferred (see Issue backlog).
- Threaded through every spend-total call site that already had ADR-089
  awareness: `actualByCategoryInRange`/`combinedActualByCategory` (Dashboard,
  Simple view, Year in Review), `buildActualResolver` (Spending, Paycheck
  Budget spend history), Spending by Place, Fix Places, and the Transactions
  screen's "hide internal transfers" filter — each now computes
  `opaqueTransferAccountIds(accounts)` once and passes it through, so the
  behavior is consistent everywhere spend is totaled, not just on one screen.
- New toggle on `AccountDialog`: "Not fully tracked — count transfers as
  spend," off by default on every existing and new account (zero behavior
  change until explicitly turned on).
- `scripts/migrations/2026-09-17-transfers-count-as-spend.sql` (user-run):
  adds the column and flags the household's two known not-fully-tracked
  accounts (Steph One Checking, Cash — Stephanie) `true`. Data-only besides
  the new column; retroactive by construction, since `internalTransferIds()`
  is recomputed fresh from live data on every render — no backfill of
  historical rows needed.

Reason:
Interviewed after the user noticed a transfer to a personal account was
being excluded from spend the same as any internal transfer, and explained
why that's wrong for their situation: they don't have full visibility into
their spouse's personal accounts yet (a temporary state, not permanent), so
money that lands there is functionally gone from what this household's
ledger can account for — closer to spend than to a same-household wash. A
per-account toggle was chosen over hardcoding "spouse's accounts" so the
household can flip it off per-account once that visibility gap closes,
with no code change needed. Symmetric "reverse counts as income" was the
user's first choice but reversed after discovering the app has no income
computation path a transfer leg could join without a separate, larger
feature — asymmetric (only the outgoing direction affected) was chosen
instead as the safe, buildable-today behavior.

Status: Decided 2026-09-17. Implemented 2026-09-17. Not yet checked in a
running browser; SQL migration not yet applied — user runs it manually.

## ADR-108: Daily Financials Screen and Dashboard Daily-Spend Chart

Decision:
A new `/app/daily-financials` screen and a new Dashboard chart, both purely
client-side aggregation over existing columns — no schema change.

1. **Daily Financials screen** (`src/routes/app.daily-financials.tsx`,
   `src/lib/daily-financials.ts`): pick a day (Popover + the existing
   shadcn `Calendar` component — first real use of it in this app; every
   other date field elsewhere is a plain `<input type="date">`, but the
   user specifically asked for a calendar picker here) and see:
   - Money in / money out / net for that day — whole-ledger cash movement,
     every transaction dated that day, transfer-internal legs excluded via
     the existing `internalTransferIds`/`opaqueTransferAccountIds`
     (ADR-089/107), no category or bill/debt filtering.
   - Spending by category, categories with zero spend that day omitted,
     each expandable (via the existing-but-previously-unused shadcn
     `Collapsible`) to a per-institution breakdown read directly off
     `transactions.institution_id` (ADR-053). **Deliberately spending-only**
     — a transaction carrying `linked_bill_id`/`linked_debt_id` is excluded
     here, shown only in the list below instead — chosen over folding
     bills/debts into category totals (the convention `combinedActualByCategory`/
     `actualByCategoryInRange` use everywhere else) specifically so the same
     dollar doesn't visibly double-count between the two sections on one
     screen.
   - Bills/debts paid that day, grouped by linked bill/debt id.
   - Every section keys off `transaction_date`, never `cleared_date`
     (ADR-100) — the user's own instruction — and includes pending +
     cleared transactions alike, matching how every other spend-total
     function in this codebase already works (none of them gate on
     `status`).
2. **Dashboard daily-spend chart** (`src/routes/app.index.tsx`, bottom of
   the "More Info" / full-details view, right after the net worth trend
   chart): a recharts `BarChart` of total money-out per day, toggleable
   between the current pay period (`currentPayPeriod`) and the current
   calendar month (`currentMonthWindow`), both already in
   `src/lib/pay-period.ts`. **Not** spending-only — this bar shows the same
   whole-ledger daily outflow as the new screen's "Money out" figure,
   bills/debts included. Intentional asymmetry with the Daily Financials
   category section above: there's no adjacent "paid today" list on the
   Dashboard for a bill/debt payment to double up against, so the trend is
   more useful read as real daily burn than as discretionary-only spend.
3. Two new emoji (🐍, 🐱) appended to `CATEGORY_ICONS`
   (`src/lib/visual-meta.ts`) — the household's own nicknames ("vypr" and
   "kitten"). One array already backs both the category icon picker and
   the tag icon picker (`TagDialog` reuses `IconPicker` from
   `app.categories.tsx`), so no other file needed a change for this part.

Reason:
Interviewed via `/plan`. The user wanted a day-level companion to the
existing month/pay-period-level screens (Spending, Monthly Summary,
Paycheck Budget) — nothing in the app answered "what happened on this
specific day" before. Spending-only vs. bills/debts-folded-in for the
category section, and pending-vs-cleared-only for every date filter, were
both explicitly interviewed rather than assumed, given how easy it would be
to silently double-count or under-count against the conventions already
established in `combinedActualByCategory`/`actualByCategoryInRange`/
`buildActualResolver`.

Status: Decided 2026-09-20. Implemented 2026-09-20 — `tsc --noEmit` clean,
243/243 tests pass (8 new), `vite build` succeeds and regenerated
`routeTree.gen.ts` with the new route. Not yet checked in a running
browser — this session's sandbox networking can't reach the dev server;
needs a Codespace or real terminal pass per CLAUDE.md.
