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
    domain text,
    parent_category uuid references categories(id),
    created_at timestamptz default now()
)
```

## Domain Values

Examples:

* bill
* debt
* spending
* institution

The domain is informational only and not enforced as an enum.

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
    account_number text,
    interest_apy numeric,
    credit_limit numeric,
    is_spendable boolean default false,
    include_in_net_worth boolean default true,
    starting_balance numeric default 0,
    notes text,
    created_at timestamptz default now(),
    updated_at timestamptz default now()
)
```

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
    priority_order integer,
    notes text,
    date_paid_off date,
    is_paycheck_deduction boolean default false, -- ADR-032: serviced by payroll/HSA deduction
    cycle_paid_to_date numeric default 0,        -- ADR-035: cleared payments applied to the current cycle
    cycle_interval_days integer,                 -- ADR-040: interval in days when billing_cycle = 'custom'
    created_at timestamptz default now(),
    updated_at timestamptz default now()
)
```

## Debt Types

Current values:

* Medical
* Credit Card
* Loan
* Other
* Advance

Previous categories such as:

* Car Loan
* Mortgage
* Student Loan

are no longer used.

---

# debt_strategy_settings

Controls payoff strategy.

```sql
debt_strategy_settings (
    household_id uuid primary key references households(id),
    active_strategy text,
    extra_monthly_payment numeric default 0,
    updated_at timestamptz default now()
)
```

Examples:

* Snowball
* Avalanche
* Custom Priority

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

* `account_balances` inherits security through `accounts`.

---

# Known Schema Rules

## Never Add

* Password columns
* User-specific ownership columns on financial tables
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
