# SCHEMA.md

## Purpose

This document defines the current database schema for the household budgeting and debt payoff application.

The application is a shared household finance tracker built on:

* **Frontend:** Lovable (React/Vite)
* **Backend:** Self-managed Supabase
* **Database:** PostgreSQL
* **Authentication:** Supabase Auth
* **Authorization:** Row-Level Security (RLS)

The system is designed around a shared household model where exactly two users access the same financial data.

---

# Core Design Principles

## Household Isolation

Every user-visible table is scoped through:

```sql
household_id uuid not null references households(id)
```

All access is controlled through Row-Level Security policies using:

```sql
is_household_member(household_id)
```

Users never directly own financial records. They belong to a household, and the household owns the data.

---

## Financial Data Model

The hierarchy is:

```
Household
 ├── Members
 ├── Categories
 ├── Institutions
 │    └── Accounts
 │         └── Account Balances
 │         └── Transactions
 │
 ├── Bills
 ├── Debts
 ├── Debt Strategy Settings
 ├── Spending Budgets
 └── Spending Actuals
```

---

# Tables

---

# households

Stores the shared household container.

```sql
households (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    -- ADR-028: preferred Status Snapshot export encoding.
    export_format text not null default 'png' check (export_format in ('png','pdf')),
    created_at timestamptz default now()
)
```

---

# household_members

Connects authenticated users to a household.

```sql
household_members (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    user_id uuid references auth.users(id),
    display_name text,
    role text,
    theme text not null default 'standard', -- ADR-061: per-user UI color theme
    created_at timestamptz default now()
)
```

---

# categories

Shared categorization system used across financial records.

```sql
categories (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    name text not null,
    domain text not null,           -- DB-enforced check, see Domain Values below
                                     -- (verified NOT NULL live 2026-09-08, ADR-097 —
                                     -- this doc previously showed it as nullable)
    parent_category text,           -- ADR-067: free text, not a self-referencing FK
    created_at timestamptz default now()
)
```

Also has `icon`/`color` (ADR-029/030, see their own section below).

## Domain Values

DB-enforced via a `check` constraint (ADR-069):

* `bill`
* `debt`
* `spending`
* `income`

`domain` is the single source of truth for where a category may appear: only
`spending` categories get budgets or land in budget grids; `income`
categories are ad-hoc income only, chosen via an explicit Income mode in Add
Transaction, never inferred from the amount sign (ADR-069). The `income`
value and its four seed categories (Income, Credit, Refund, Gift) have
already been migrated in — this isn't pending.

---

# institutions

Represents organizations that provide accounts or services.

Examples:

* Banks
* Credit card companies
* Utilities
* Subscription providers
* Medical providers
* Lenders

```sql
institutions (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    name text not null,
    institution_type text not null,
    category_id uuid references categories(id),
    login_url text,
    login_username text,
    sign_in_with_google boolean default false,
    description text,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
)
```

`institution_type` is DB-enforced via a check constraint
(`institutions_institution_type_check`) — corrected 2026-09-09 (ADR-099):
this doc and `INSTITUTION_TYPES`'s own comment in
`src/components/InstitutionDialog.tsx` previously claimed it was UI-list-only
with no DB constraint; verified live to be wrong (a reclassification
migration failed against it). Current 22 allowed values: `bank`,
`credit_card`, `lendor_lessor`, `financial`, `tool`, `medical`, `utility`,
`subscription`, `restaurant`, `grocery_store`, `gas_station`,
`liquor_store`, `department_store`, `specialty_store`, `venue`, `game`,
`app`, `dispensary`, `personal_care`, `employer`, `delivery`, `other`. Keep
the constraint and `INSTITUTION_TYPES` in sync — adding a new type needs
both an app-side array update and a
`scripts/migrations/*.sql` constraint migration (see
`2026-09-09-institution-type-check-constraint.sql` for the pattern).

## Important Rules

* Never store passwords.
* Login credentials belong in a dedicated password manager.
* Institutions may exist without accounts.

---

# accounts

Represents balance-bearing financial accounts.

Examples:

* Checking account
* Savings account
* Credit card
* Loan account

```sql
accounts (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    institution_id uuid references institutions(id),
    name text not null,
    account_type text not null,
    account_subtype text,
    account_number text,          -- full or masked; only last 4 ever displayed. User-editable via AccountDialog (ADR-021 addendum 2026-08-27)
    interest_apy numeric,
    credit_limit numeric,
    is_spendable boolean default true,   -- live default is TRUE
    include_in_net_worth boolean default true,   -- ADR-088: false drops the account from the net-worth trend
    owner_member_id uuid references household_members(id) on delete set null,  -- ADR-088: null = joint; a set owner scopes spendable/net-worth aggregates to that member
    starting_balance numeric default 0,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
)
```

`account_type` carries no DB check constraint (unlike `institution_type`,
ADR-099) — the allowed set lives only in `AccountDialog.tsx`'s
`ACCOUNT_TYPES`. ADR-103: `"cash"` is a real type used for physical cash —
one `accounts` row per household member (`owner_member_id` set, not joint),
no `institution_id`. `src/lib/balances.ts`'s `SPENDABLE_TYPES` includes
`"cash"` so it counts toward the spendable-money total like checking.

---

# account_balances

Stores periodic balance snapshots.

```sql
account_balances (
    id uuid primary key default gen_random_uuid(),
    account_id uuid references accounts(id) on delete cascade,
    balance numeric not null,
    as_of_date date not null,
    created_at timestamptz default now()
)
```

## Balance Calculation

Current balance is calculated as:

```
Latest account_balances snapshot
+
Transactions after snapshot date
```

If no snapshot exists:

```
starting_balance
+
all transactions
```

---

# transactions

The financial ledger.

Every money movement is represented here.

```sql
transactions (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    account_id uuid references accounts(id),
    amount numeric not null,
    status text not null,
    category_id uuid references categories(id),
    linked_bill_id uuid references bills(id),
    linked_debt_id uuid references debts(id),
    description text,
    transaction_date date not null,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
)
```

## Transaction Rules

Transactions are the source of truth for:

* Payments
* Purchases
* Transfers
* Manual adjustments

A cleared bill or debt payment must have a matching cleared transaction.
### Payment Reversals (ADR-070)

A bounced/returned payment is corrected via a second transactions row, not a delete or
update of the original — mirrors the fee-transaction shape (ADR-046). The reversal row:
same account_id, amount = -original.amount, status = 'cleared', same linked_bill_id/
linked_debt_id as the original, description "Reversed: <name> payment".

The originating bill's cycle_paid_to_date (or debt's remaining_balance/cycle_paid_to_date)
is updated first, using greatest(0, current - abs(original.amount)) so the same logic is
correct whether or not the cycle already rolled forward since the bounced payment cleared.
See ADR-070 for the full write order and payment_status reset rule.

---

# bills

Recurring obligations.

```sql
bills (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    name text not null,
    category_id uuid references categories(id),
    account_id uuid references accounts(id),
    amount numeric not null,
    next_due_date date,
    billing_cycle text,
    payment_status text,
    manual_or_auto text,
    is_variable_amount boolean default false, -- prompt for the amount owed each cycle
    cycle_amount_due numeric,                 -- actual amount owed for the current cycle
    cycle_paid_to_date numeric default 0,     -- cleared payments applied to the current cycle
    cycle_interval_days integer,              -- ADR-040: interval in days when billing_cycle = 'custom'
    opening_arrears numeric default 0,        -- ADR-049: past due carried in from before tracking
    arrears_as_of date,                       -- ADR-049: date the opening_arrears figure was accurate

    notes text,
    is_active boolean default true,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
)
```

## Supported Billing Cycles

Examples:

* Monthly
* Biweekly
* Every 60 days
* Quarterly
* Semiannual
* Annual

Bills do not use a universal monthly reset.

---

# debts

Represents money owed.

```sql
debts (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    name text not null,
    category_id uuid references categories(id),
    debt_type text,
    institution_id uuid references institutions(id),
    starting_balance numeric,
    program_start_balance numeric,
    remaining_balance numeric,
    minimum_payment numeric,
    interest_rate numeric,
    known_finance_charge numeric,
    due_day integer,
    payment_status text,
    on_payment_plan boolean,
    manual_or_auto text,
    priority_order integer,                      -- Custom payoff order; dense 1..N over active non-advance debts, written by the Debt Strategy reorder editor + auto-assigned on new debts (ADR-094)
    notes text,
    date_paid_off date,
    is_paycheck_deduction boolean default false, -- ADR-032: serviced by payroll/HSA deduction
    cycle_paid_to_date numeric default 0,        -- ADR-035: cleared payments applied to the current cycle
    cycle_interval_days integer,                 -- ADR-040: interval in days when billing_cycle = 'custom'
    plan_payment_count integer,                  -- ADR-048: instalments in the payment plan, when known
    plan_final_payment numeric,                  -- ADR-048: final instalment when it differs
    opening_arrears numeric default 0,           -- ADR-049: past due carried in from before tracking
    arrears_as_of date,                          -- ADR-049: date the opening_arrears figure was accurate

    created_at timestamptz default now(),
    updated_at timestamptz default now()
)
```

### Debt payoff-date invariant (ADR-066 addendum)

`trg_sync_debt_date_paid_off` runs before inserts and updates that touch
`remaining_balance`, `debt_type`, or `date_paid_off`. For every debt whose
normalized type is not `advance`, `remaining_balance <= 0.005` requires a
populated `date_paid_off`; moving above the threshold clears the date. Advance
debts are exempt because they are reusable at a zero balance.

## Debt Types

DB-enforced lowercase check constraint (ADR-066). Current values:

* `advance`
* `credit card`
* `invoice`
* `loan`
* `medical`
* `other`

Previous free-text categories (Car Loan, Mortgage, Student Loan, …) are no
longer used.

**`advance`** debts are excluded from the payoff engine and the Payment Schedule
(ADR-094) — their `minimum_payment` mirrors the full balance and they repeat
each cycle, so amortising them distorts the projection. They stay fully visible
on the Debts / Everything screens and count toward obligation totals.

---

# debt_strategy_settings

Controls payoff strategy.

```sql
debt_strategy_settings (
    household_id uuid primary key references households(id),
    active_strategy text not null default 'none',
    extra_monthly_payment numeric not null default 0,
    updated_at timestamptz not null default now(),
    -- ADR-095: strategy lock + baseline snapshot. All null = unlocked.
    strategy_locked_at timestamptz,
    locked_strategy text,
    locked_extra_monthly_payment numeric,
    locked_priority_order jsonb,            -- array of debt-id strings
    baseline_debt_free_date date,           -- display only, never fed back to the engine
    baseline_total_interest numeric         -- display only
)
```

Examples:

* Snowball
* Avalanche
* Custom Priority

ADR-095: while `strategy_locked_at` is set, the Debt Strategy screen freezes the
picker / extra payment / Custom order; projections everywhere recompute from the
`locked_*` inputs against live balances and compare against the two `baseline_*`
scalars to show an ahead/behind scoreboard. Re-locking overwrites all six.

---

# spending_budgets

Monthly planned spending.

```sql
spending_budgets (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    category_id uuid references categories(id),
    budgeted_amount numeric not null,
    updated_at timestamptz default now()
)
```

---

# spending_actuals

Tracks actual spending.

```sql
spending_actuals (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    category_id uuid references categories(id),
    month date not null,
    actual_amount numeric not null,
    is_manual_override boolean not null default false, -- ADR-041
    created_at timestamptz default now()
)
```

---

# Row-Level Security

All household-owned tables require:

```sql
household_id
```

and enforce:

```sql
is_household_member(household_id)
```

Exceptions:

* `account_balances` inherits security through `accounts` (policy joins to
  `accounts` and checks `is_household_member(accounts.household_id)`).
* `income_source_splits` and `institution_categories` likewise join to their
  parent (`income_sources` / `institutions`).
* `households` and `household_members` have SELECT-only policies
  (`is_household_member(id)` / `(household_id)`), plus a self-UPDATE policy on
  `household_members` (`user_id = auth.uid()`, ADR-061 follow-up).

`is_household_member(hid)` is `STABLE SECURITY DEFINER`, owned by `postgres`:
`select exists (select 1 from household_members where household_id = hid and
user_id = auth.uid())`.

2026-08-26 (ADR-083): every public data table now also has `force row level
security` (belt-and-suspenders — near-no-op while all tables are owned by
`postgres`, which has BYPASSRLS). `auto_transfers` shipped in ADR-081 with RLS
DISABLED — fixed the same day: `enable row level security` + the standard
`household access` policy. All 24 public data tables now have
`relrowsecurity = true` and a policy.

---

# Known Schema Rules

## Never Add

* Password columns
* User-specific ownership columns on financial tables **that restrict row
  visibility or edit rights**. ADR-088 (2026-08-27) adds
  `accounts.owner_member_id` — allowed because it only scopes on-screen
  *aggregates* (spendable / net worth) per viewer; both members still see and
  edit every account, and the ledger is untouched. Same carve-out as ADR-061's
  per-user `household_members.theme`.
* Duplicate payment tracking systems

---

## Source of Truth

| Data             | Source                          |
| ---------------- | ------------------------------- |
| Account balances | account_balances + transactions |
| Payments         | transactions                    |
| Bills            | bills                           |
| Debts            | debts                           |
| Users            | household_members               |

---

# Recent Schema Fixes

## Institution vs. Account References (Bills & Debts)

Both bills and debts reference institutions directly (institution_id), not accounts.
This allows a bill or debt to be owed to an institution with no balance-bearing account
underneath it (e.g. a subscription, a utility, a medical provider).

Which account actually paid a given bill/debt cycle is tracked per-payment via
transactions.account_id (linked through linked_bill_id / linked_debt_id) — not a static
field on bills or debts. See ADR-006.

---

---

## savings_goals (ADR-027)

| column | type | notes |
| --- | --- | --- |
| id | uuid pk | gen_random_uuid() |
| household_id | uuid not null | references households(id) on delete cascade |
| name | text not null | |
| icon | text | single emoji |
| target_amount | numeric(12,2) not null | |
| target_date | date | optional |
| created_at / updated_at | timestamptz not null | default now() |

RLS: `for all using (is_household_member(household_id)) with check (...)`.

`transactions.linked_goal_id uuid references savings_goals(id)` links funding and
withdrawal rows to a goal, mirroring linked_bill_id / linked_debt_id.

A goal's **current_amount is not stored** — it is the sum of `transactions.amount`
where `linked_goal_id = goal.id and status = 'cleared'` (ADR-003).


## ADR-061 column (2026-08-14)

- `household_members.theme text not null default 'standard'` — per-user UI
  color theme preference, checked against the 7 selectable values (`standard`,
  `halo`, `hellokitty`, `purple_dark`, `purple_pastel`, `cyber_neon`,
  `cyber_stealth`). Display-only; no logic depends on its value, and the
  page-level `data-theme` attribute it drives touches CSS custom properties
  only, never component logic.

```sql
alter table household_members
  add column if not exists theme text not null default 'standard'
  check (theme in ('standard', 'halo', 'hellokitty', 'purple_dark',
                    'purple_pastel', 'cyber_neon', 'cyber_stealth'));

notify pgrst, 'reload schema';
```

## ADR-029 / ADR-030 columns (2026-08-03)

- `categories.icon text` — nullable emoji shown on category rows.
- `categories.color text` — nullable hex accent colour for category rows.
- `institutions.logo_url text` — nullable logo image URL (usually a derived favicon).

All three are display-only; no logic depends on them being non-null.


## ADR-039 columns (2026-08-05)

`pay_period_allocations`

| column | type | notes |
|---|---|---|
| category_id | uuid references categories(id) | now **nullable** |
| goal_id | uuid references savings_goals(id) | nullable; set instead of category_id |

Check constraint: exactly one of `category_id` / `goal_id` is non-null — a row allocates
to a spending category OR a savings goal, never both.

---

# Migration: ADR-048 / ADR-049 (2026-08-11)

Run in the Supabase SQL Editor. Until it is applied the app degrades gracefully:
the new fields are dropped from the save payload and everything else still saves.

```sql
-- ADR-048: invoice payment plans
alter table public.debts add column if not exists plan_payment_count integer;
alter table public.debts add column if not exists plan_final_payment numeric;

-- ADR-048: a one-time charge must be storable without a starting balance
alter table public.debts alter column starting_balance drop not null;

-- ADR-049: past due carried in from before Hearthstone tracked the item
alter table public.debts add column if not exists opening_arrears numeric default 0;
alter table public.debts add column if not exists arrears_as_of date;
alter table public.bills add column if not exists opening_arrears numeric default 0;
alter table public.bills add column if not exists arrears_as_of date;

notify pgrst, 'reload schema';
```

`billing_cycle` gains the value `one_time` (ADR-048). It is stored as text, so no
enum change is required.

## Phase 10 migration (ADR-052, ADR-053) — run in Supabase

```sql
alter table public.debts add column if not exists invoice_number text;
alter table public.transactions
  add column if not exists institution_id uuid references public.institutions(id) on delete set null;
create index if not exists transactions_institution_id_idx
  on public.transactions (institution_id);
notify pgrst, 'reload schema';
```
## income_source_splits (ADR-024 / ADR-047)

The deposit template for an income source: how a received paycheck is broken
across accounts. `useMarkIncomeReceived` creates one cleared `transactions` row
per fixed split plus one for the remainder (`actual_amount` − Σ fixed amounts),
all sharing `split_group_id = income_events.id`.

```sql
income_source_splits (
    id uuid primary key default gen_random_uuid(),
    income_source_id uuid not null references income_sources(id) on delete cascade,
    account_id uuid not null references accounts(id),
    label text,                             -- optional display label (unused today)
    split_type text not null,               -- 'fixed' | 'remainder' (one remainder per source)
    amount numeric,                         -- fixed splits only; null for the remainder
    day_offset integer not null default 0,  -- posting date vs pay date; NEGATIVE = lands early (ADR-047 2026-09-10)
    time_of_day text,                       -- present in DB, DORMANT: not read/written/documented anywhere
    sort_order integer not null default 0
)
```

No `household_id` — scoped through `income_source_id`. No RLS policy of its own
in this doc; access follows the parent `income_sources` join.

## income_source_deductions (ADR-055)

Deductions taken from a paycheck before it reaches spendable accounts (HSA,
LPFSA, retirement, etc.). `income_sources`' amount field keeps its existing
meaning (net); gross is computed as net + Σ(deductions), never stored.

```sql
income_source_deductions (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    income_source_id uuid references income_sources(id) on delete cascade,
    name text not null,
    amount numeric(12,2),      -- exactly one of amount / percent is set
    percent numeric(6,3),
    destination_account_id uuid references accounts(id),
    is_pre_tax boolean default false,
    kind text not null default 'payroll',   -- ADR-082: payroll | hsa | fsa | other
    created_at timestamptz default now()
)
-- ADR-082 (applied 2026-08-26):
alter table income_source_deductions add column if not exists kind text not null default 'payroll';
alter table income_source_deductions add constraint income_source_deductions_kind_check
  check (kind in ('payroll','hsa','fsa','other'));
```

Percent-type deductions compute against the income event's `actual_amount`
(net), not a derived gross figure — resolved 2026-08-12, see ADR-055.

`kind` (ADR-082) is the single source of truth for classifying a deduction —
it replaced a name/type regex heuristic. It drives the Dashboard "Past due"
three-way grouping (Paycheck deduction / HSA · FSA / Other) and the row-level
"HSA-funded"/"FSA-funded"/"Deduction-funded" label. Independent of
`debts.is_paycheck_deduction`, which keeps its ADR-032 budgeting-exclusion job.

Deductions with `destination_account_id` set get a real deposit transaction
when the pay event is marked received (ADR-047), sharing that event's
`split_group_id`. Deductions with no destination account are reporting-only.

## Deduction-funded bills/debts (ADR-068)

Applied manually 2026-08-18 in the Supabase SQL Editor.

```sql
alter table bills add column funding_deduction_id uuid references income_source_deductions(id);
alter table debts add column funding_deduction_id uuid references income_source_deductions(id);

create table if not exists deduction_payment_events (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  bill_id uuid references bills(id) on delete cascade,
  debt_id uuid references debts(id) on delete cascade,
  deduction_id uuid not null references income_source_deductions(id) on delete cascade,
  event_type text not null check (event_type in ('mismatch','already_paid_noop')),
  expected_amount numeric(12,2),
  actual_amount numeric(12,2),
  note text,
  created_at timestamptz not null default now()
);
```

A bill/debt may only point at a deduction that has a `destination_account_id`;
that rule is enforced in the app's write path (bill/debt dialogs), not by a DB
constraint. `deduction_payment_events` is written only when a deduction-funded
payment doesn't match the cycle's due amount, or when the cycle was already
cleared by hand and the auto-payment did nothing.

---

## transactions.transfer_group_id (ADR-056)

```sql
transactions (
    ...
    transfer_group_id uuid  -- ADR-056: tags the 2 rows of one transfer/advance,
                             -- same pattern as split_group_id
)
```

No FK — self-tagging group id, not a parent row. A transfer writes two rows
sharing one `transfer_group_id` (negative on the from-account, positive on
the to-account). A debt advance writes one deposit transaction (tagged with
`transfer_group_id`) paired with a `debt_adjustments` row — see below —
rather than a second linked transaction.

ADR-097: a transfer may also carry an optional fee — a third, plain
transaction on the from-account (no `transfer_group_id`), reusing ADR-046's
fee mechanism and paired to the transfer via `split_group_id` instead (set
to the same UUID as the pair's `transfer_group_id`). No schema change.

ADR-103: "Cash Back" generalizes that same fee-pairing to N categorized
purchase rows instead of one fixed-category amount — a blended register
swipe (part purchase, part cash back) writes a transfer pair (checking to a
Cash account) plus one or more plain purchase rows on the from-account,
`split_group_id` = the pair's `transfer_group_id`. `classifyLedgerGroup`
(`src/lib/split-groups.ts`) treats a `split_group_id` that is also some
transfer's `transfer_group_id` as `"cash-back-purchase"`, never a genuine
category split, regardless of how many purchase rows share it. No schema
change; see ADR-103 for why (double-counting a cash withdrawal that's later
spent) and `useDeleteTransferPair` in `data-hooks.ts` for cleanup.

---

## transactions.resolved_cycle_due_date (ADR-075)

```sql
transactions (
    ...
    resolved_cycle_due_date date  -- ADR-075: due date this transaction's clear
                                    -- resolved, when it resolved one
)
```

Nullable, no default, no backfill — existing rows stay untagged. Written by
`applyClearedPayment` (`src/lib/payments.ts`) at the moment a bill/debt cycle
resolves: every cleared, linked, still-untagged transaction for that payable
gets tagged with the due date that just advanced past. `deriveCycleInfo`
(`src/lib/ledger-state.ts`) excludes a transaction tagged with a due date
earlier than the payable's current due date from the "current cycle" window,
regardless of its raw `transaction_date` — fixes a late payment (paid after
its own due date) from being misattributed to the next, freshly-rolled cycle.

---

## bill_adjustments (ADR-058)

Bills' counterpart to `debt_adjustments` — a signed, non-payment change to
what's owed on a bill (insurance coverage, a late fee, etc.), separate from
real account movement.

```sql
bill_adjustments (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    bill_id uuid references bills(id) on delete cascade,
    amount numeric(12,2) not null,       -- signed: negative reduces what's owed,
                                          -- positive increases it
    affects_balance boolean default true, -- false = record-only, doesn't touch
                                           -- cycle_amount_due / arrears
    adjustment_type text,
    description text,
    adjustment_date date default current_date,
    created_at timestamptz default now()
)
```

## debt_adjustments — new column (ADR-058)

```sql
debt_adjustments (
    ...
    affects_balance boolean default true  -- false = record-only, doesn't
                                           -- touch remaining_balance
)
```

Existing rows default to `true`, preserving ADR-045's original behavior.
This is unrelated to ADR-046's payment-fee transactions, which already never
touch the cycle — that mechanism is unchanged.

---

# Migration: ADR-055 / ADR-056 / ADR-058 (2026-08-11)

Run in the Supabase SQL Editor — already applied and verified for this
project; kept here for reference / re-application on a fresh environment.

```sql
create table if not exists income_source_deductions (
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

alter table transactions add column if not exists transfer_group_id uuid;

create table if not exists bill_adjustments (
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

notify pgrst, 'reload schema';
```

Note: ADR-057 (overdue-aware payment allocation) introduces no schema —
it reuses `bills`/`debts`.`opening_arrears` and `arrears_as_of` (ADR-049).
## ADR-061 follow-up — member self-update RLS (2026-08-14)

The theme column alone is not enough: `household_members` had no UPDATE policy,
so the write matched zero rows and PostgREST returned success with no error.

```sql
create policy "Members can update their own member row"
on public.household_members
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

grant update on public.household_members to authenticated;

notify pgrst, 'reload schema';
```

Note: ADR-077 ("Correct this payment") introduces no schema — reuses
`cycle_paid_to_date`/`remaining_balance` (ADR-035) and `resolved_cycle_due_date`
(ADR-075).

ADR-076 (arrears-only payments) originally routed arrears-directed credit through
`opening_arrears`/`arrears_as_of` (ADR-049) instead of a dedicated column. ADR-078
(below) replaced that with a real column after the reuse proved wrong — see there for
why, and for `opening_arrears`/`arrears_as_of`'s restored original (ADR-049-only)
meaning.

## bills/debts.arrears_paid_to_date (ADR-078)

```sql
bills (
    ...
    arrears_paid_to_date numeric default 0  -- ADR-078: running total of
                                              -- arrears-directed payments
)
debts (
    ...
    arrears_paid_to_date numeric default 0  -- same
)
```

```sql
alter table bills add column if not exists arrears_paid_to_date numeric default 0;
alter table debts add column if not exists arrears_paid_to_date numeric default 0;
notify pgrst, 'reload schema';
```

A running counter of money credited via `applyArrearsPayment` (ADR-076's "Log arrears
payment") or `applyClearedPayment`'s overflow-into-arrears path — subtracted from
`computeArrears`'s live-computed raw total (`opening_arrears + missedAmount`) in
`arrears.ts`. Never reset (see ADR-078's Decision for why that's safe): a normal cycle
resolve only ever shrinks the raw walk by the current cycle's own amount, which is
always covered by `cycle_paid_to_date`, never overlapping with what this counter
tracks. Kept deliberately separate from `opening_arrears`/`arrears_as_of`, which are
back to meaning only ADR-049's original one-time manual pre-tracking carry-in.

## bills/debts.updated_at trigger (ADR-079)

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

`updated_at`'s `default_value: now()` only ever applied on INSERT — no app code path
set it on UPDATE and no trigger existed, so it was frozen at row-creation time forever.
This trigger makes it actually reflect the last write, which `findStrandedBillPayments`/
`findStrandedDebtPayments` (dedup guard) and `computeArrears`'s monthly `clearedRecently`
check both depend on. No column added — this only changes when `updated_at` gets
written, not the schema shape.

---

## auto_transfers (ADR-081)

```sql
auto_transfers (
    id uuid primary key default gen_random_uuid(),
    household_id uuid references households(id) on delete cascade,
    name text not null,
    from_account_id uuid references accounts(id) not null,
    to_account_id uuid references accounts(id) not null,
    amount numeric not null,
    category_id uuid references categories(id),
    next_due_date date not null,
    billing_cycle text not null,
    cycle_interval_days integer,
    is_active boolean default true,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
)
```

New table for recurring auto-transfers between the household's own accounts (e.g.
SoFi/Stash biweekly investing sweeps — see the 2026-08-20/21 SoFi-Invest/Stash-Invest
cleanup that surfaced the gap). Deliberately has no arrears/partial-payment columns
(`cycle_amount_due`, `cycle_paid_to_date`, `opening_arrears`, etc.) — an auto-transfer
either processed this cycle or it didn't, there's no partial state. `billing_cycle`/
`cycle_interval_days` reuse the same vocabulary as `bills`/`debts`. Covered by the same
`set_updated_at()` trigger (ADR-079) as `bills`/`debts`.

## transactions.linked_auto_transfer_id (ADR-081)

```sql
transactions (
    ...
    linked_auto_transfer_id uuid references auto_transfers(id)
)
```

"Process transfer" writes a normal ADR-056 transfer pair (two cleared transactions
sharing `transfer_group_id`) but tags **only the credit (destination) leg** with
`linked_auto_transfer_id` — mirroring how a single bill payment carries `linked_bill_id`,
so `deriveCycleInfo`-style ledger-state logic (a stripped-down version lives in
`src/lib/auto-transfers.ts`'s `deriveAutoTransferState`) can find it and compare against
the auto-transfer's due amount, the same way it does for a bill's single-sided payment.
The debit (source) leg stays a plain, unlinked transfer leg like any other transfer.

## tags / transaction_tags (ADR-104)

```sql
tags (
    id          uuid primary key default gen_random_uuid(),
    household_id uuid not null references households(id) on delete cascade,
    name        text not null,
    icon        text,   -- emoji, optional — ADR-029 convention
    color       text,   -- hex, optional — ADR-029 convention
    created_at  timestamptz not null default now()
)

transaction_tags (
    transaction_id uuid not null references transactions(id) on delete cascade,
    tag_id         uuid not null references tags(id) on delete cascade,
    primary key (transaction_id, tag_id)
)
```

Same shape as `institution_categories` (ADR-005) — no own `id` on the join
table, composite PK, both FKs `on delete cascade`. A tag applies to any
`transactions` row, including one specific line of a split (each split line
is its own row sharing `split_group_id` — tagging a line is just a
`transaction_tags` row against that line's id, no new granularity concept).
RLS on `transaction_tags` is scoped through `tags.household_id` (`exists
(select 1 from tags where tags.id = transaction_tags.tag_id and
is_household_member(tags.household_id))`), not through `transactions` —
cheaper, since a household's `tags` list stays small while `transactions`
does not (`src/lib/data-hooks.ts`'s `useTransactions()` had to add
pagination once this household passed 1000 transactions — `useTransactionTags()`
avoids that class of problem by never listing transaction ids at all).

## transactions.cleared_date (ADR-100)

```sql
transactions (
    ...
    cleared_date date  -- ADR-100: when this actually posted/cleared at the
                        -- bank; null for a still-pending row
)
```

`transaction_date` means "when this was logged/initiated/submitted" and never
changes on a later status transition. `cleared_date` is the date a bank
statement would actually show — set automatically equal to the entered date
whenever a row is written directly with `status: 'cleared'` (manual cleared
entries, transfers, splits, reversals, corrections, historical logged
payments), and explicitly prompted for (defaulting to today, editable)
specifically at the pending → cleared transition — the one moment "today" is
real new information distinct from the row's own `transaction_date`.

Backfilled for every pre-existing `cleared` row (`cleared_date =
transaction_date`) by the migration that added the column, so it's reliably
non-null for every cleared row going forward — `src/lib/balances.ts` and
`src/lib/net-worth.ts` still keep a defensive `?? transaction_date` fallback,
but it should never be load-bearing post-backfill. Both of those now compare
a cleared transaction's `cleared_date` (not `transaction_date`) against a
balance anchor's `as_of_date`, matching what the bank itself would have
posted by that date. Deliberately **not** used by `src/lib/ledger-state.ts`'s
`deriveCycleInfo()` (cycle-window attribution stays on `transaction_date` —
which cycle a payment resolves reflects when it was recorded, not whenever
the bank got around to posting it) or by Dashboard/Spending's period
bucketing, for the same reason.

---

## institution_links, institution_member_accounts, institution parent/child (ADR-106)

Applied via `scripts/migrations/2026-09-16-institution-links-members-parent.sql`, verified live.

```sql
create table institution_links (
    id uuid primary key default gen_random_uuid(),
    institution_id uuid not null references institutions(id) on delete cascade,
    kind text not null check (kind in ('bill_pay', 'patient_portal', 'other')),
    label text,
    url text not null,
    sort_order integer not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
)
```

Additional named links per institution — `institutions.login_url` stays the
"Main site" link, unchanged; this table only holds extras (Bill Pay,
Patient Portal, custom "Other"). No own `household_id` — RLS joins to
`institutions` (same shape as `institution_categories`/`transaction_tags`,
`account_balances`'s exception noted above). `kind` is a real DB-checked
enum, not free text, because the Log In button (prefers a `bill_pay` link,
falls back to `login_url`) and the medical-only "Patient Portal" gating in
the institution form both need to find "the" link of a given kind reliably.

```sql
create table institution_member_accounts (
    id uuid primary key default gen_random_uuid(),
    institution_id uuid not null references institutions(id) on delete cascade,
    member_id uuid not null references household_members(id) on delete cascade,
    account_number text,
    login_username text,
    notes text,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    unique (institution_id, member_id)
)
```

A household member's own account (account/patient #, login username) at an
institution — for providers that bill each spouse separately rather than
combining visits into one joint invoice. Same no-`household_id`,
join-through-`institutions` RLS shape as `institution_links`.

```sql
alter table institutions add column parent_institution_id uuid references institutions(id) on delete set null;
alter table bills add column institution_member_account_id uuid references institution_member_accounts(id) on delete set null;
alter table debts add column institution_member_account_id uuid references institution_member_accounts(id) on delete set null;
```

`institutions.parent_institution_id`: Amazon/Prime/Kindle/Audible-style
grouping — a child institution's accounts/bills/debts roll up into its
parent's total on the Institutions screen (`computeInstitutionTotals`,
`src/lib/balances.ts`) without merging the underlying data. Kept to 2
levels (parent + children, no grandchildren) by convention only — the
institution form only offers institutions with no parent of their own as
parent choices; not a DB constraint.

`bills`/`debts.institution_member_account_id`: optional overlay, coexists
with the existing (unchanged, still required) `institution_id` — same
"null = joint/not specified, set = this member's own" shape
`accounts.owner_member_id` already uses (ADR-088).
