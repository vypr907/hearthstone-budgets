# From Google Sheet to a Shared Android App
### A step-by-step plan for turning your budget/debt-payoff workbook into a real app on Google Play

---

## Decisions Already Locked In

| Decision | Choice |
|---|---|
| **Platform** | Android only, published to Google Play (no iOS, no PWA-only path) |
| **Users** | Shared — you + one other person, both seeing the *same* household data |
| **Migration** | One-time import, then the Google Sheet gets retired |

Everything below is built around these three choices. If any of them change later, the two things that would need rework are: the auth/schema model (built for 2 shared users — Phase 1) and the publishing steps (built for Android/Google Play only — Phase 8).

---

## How to Use This Plan

- Work through the **Phases** in order — each one has its own checklist, and later phases depend on earlier ones. A couple of phases are numbered like "3.5" — these were added after the original plan and slot in between existing phases; the decimal just avoids renumbering everything else.
- Check boxes off as you go: `- [ ]` → `- [x]`. This file is yours to edit.
- Each phase ends with a **Milestone** — a plain-language "you'll know you're done when..." checkpoint.
- Copy-paste blocks (SQL, terminal commands, Lovable prompts) are ready to use as-is, but replace anything in `<angle brackets>` or `[square brackets]` with your own values.

---

## Architecture, in One Paragraph

**Lovable** builds the app itself (a React web app under the hood) and talks to **Supabase** (a hosted Postgres database + login system) for all your data and shared access between the two of you. Once the app works in a browser, **Capacitor** (a free, open-source tool) wraps that same code into a real Android app, which you build using **Android Studio** and then publish through the **Google Play Console**. Nothing about your data lives in Lovable itself — Lovable is just the tool that writes the app's code and UI.

```
Your data & logins  →  Supabase (Postgres + Auth)
Your app's UI/logic →  Lovable (writes the code)
Native Android shell →  Capacitor (wraps the web app)
Distribution         →  Google Play Console
```

---

## Pricing Expectations

*Figures below reflect published rates as of mid-2026. These platforms (especially Lovable) change pricing fairly often — double-check current numbers at checkout before paying.*

| Item | Cost | When | Notes |
|---|---|---|---|
| **Lovable** | $0–25/mo | During active building (likely 1–2 months) | Free tier gives 30 credits/month, which likely *won't* be enough for a project this size — a build with auth, 6+ screens, and a calculator engine realistically burns 150–250 credits. Budget for 1–2 months of **Pro** ($25/mo, or $21/mo billed annually), then downgrade or cancel once the app is stable. Unused credits roll over month to month. |
| **Supabase** | $0/mo | Ongoing | Free tier (500MB database, 50,000 monthly users, 5GB egress) is enormous overkill for 2 people's financial data — you will not come close to these limits. One quirk: free projects pause after 7 days of no activity (a ~1 minute delay to "wake up" on next use). If that's ever annoying, Pro is $25/mo. |
| **Google Play Developer account** | $25 one-time | Once, before Phase 8 | No renewal, ever — this is the one and only Google fee. |
| **Capacitor + Android Studio** | $0 | Ongoing | Both fully free and open source. |
| ~~Apple Developer Program~~ | ~~$99/yr~~ | Skipped | Not needed — you don't need a Mac or Xcode either, since you chose Android-only. |
| ~~Domain name~~ | ~~~$12/yr~~ | Skipped | Not needed — you're not shipping a PWA/website. |

**Estimated cost to get to launch: ~$50–100 total** (mostly the optional Lovable Pro months, plus the one-time Play fee).
**Estimated ongoing cost after launch: ~$0/month**, unless you resubscribe to Lovable later to build new features, or you're one of the rare cases that outgrows Supabase's free tier (unlikely for a 2-person household app).

**A tip that saves real money on Lovable credits:** batch related requests into one message instead of many small ones (each message costs credits regardless of size), use the Visual Edit/manual-edit mode for simple text/color/spacing tweaks (this doesn't cost credits), and use the built-in "Try to Fix" option before manually re-prompting when something breaks.

---

## Milestones at a Glance

| # | Milestone | Phase |
|---|---|---|
| 1 | Accounts and tools ready | 0 |
| 2 | Shared login works — both of you see the same (empty) household | 1 |
| 3 | Real bill/debt/account/balance data imported and verified | 2 |
| 4 | "Everything" list + basic Dashboard totals working | 3 |
| 5 | Pending/cleared status + spendable balance working | 3.5 |
| 6 | Spending/budget tracking working | 4 |
| 7 | Quick transaction entry + running balance working | 4.5 |
| 8 | Debt strategy calculator output matches your sheet's numbers | 5 |
| 9 | Payment schedule + charts working | 6 |
| 10 | Installed as a real Android app on both phones (pre-store) | 7 |
| 11 | Live on Google Play (internal testing), installed by both of you | 8 |
| 12 | Sheet retired — the app is the single source of truth | 9 |

---

## Phase 0 — Accounts & Tools

- [ ] Create a free [Lovable](https://lovable.dev) account
- [ ] Create a free [Supabase](https://supabase.com) account
- [ ] Create a free [GitHub](https://github.com) account if you don't have one (needed in Phase 7 to export your code for the Android wrap)
- [ ] Create your GitHub repo now if you'd like — but keep it free of actual app code for the moment (a README, `.gitignore`, license is fine). Lovable's GitHub integration creates and pushes into a repo when you connect a project in Phase 1; it doesn't import pre-existing app code into itself. Whether it uses your existing repo or spins up its own depends on what you pick during that Phase 1 connect step — either way, nothing here is lost, you're just deciding where the README lives first.
- [ ] Create your Supabase project — a few settings matter at creation time:
  - **Organization / project name** — anything descriptive is fine
  - **Database password** — let Supabase generate a strong one, and save it in a password manager immediately (you'll need it if you ever connect directly via `psql` or a connection string; the app itself won't need it day-to-day)
  - **Region** — pick one geographically close to you (e.g. a US West region) for lower latency
  - **Plan** — Free tier, per the pricing section above
- [ ] After the project is created, in **Authentication → Providers → Email**, turn off "Allow new users to sign up" once you've created your 2 accounts (Phase 1) — there's no reason for public self-signup on a private 2-person app, even though Row-Level Security would still wall off any stray signups from real household data
- [ ] When you manually add your 2 users in **Authentication → Users → Add user**, check "Auto Confirm User" — this skips needing real email delivery/SMTP set up just to confirm 2 accounts you created yourself
- [ ] Skip Supabase's own GitHub integration (found under Project Settings → Integrations) — this plan doesn't use migration files, just the SQL Editor directly, so there's nothing for it to sync. The only GitHub connection this project needs is Lovable's, which happens in Phase 1 once the Lovable project actually exists — there's nothing to connect yet in Phase 0
- [ ] Everything else (network restrictions, point-in-time recovery, connection pooling) is either a paid-tier feature you don't need yet or fine left at its default for a 2-person app — the one setting that actually matters for security is enabling Row-Level Security per table, which is already baked into the Phase 1 SQL script
- [ ] Install [Node.js LTS](https://nodejs.org) on the computer you'll use for the Android build steps
- [ ] Register your Google Play Developer account now ($25 one-time) at [play.google.com/console](https://play.google.com/console/about) — verification can take a day or two, so starting this early avoids a delay later at Phase 8
- [ ] Go through your actual 18 tabs and sort each into **Core data** / **Computed view** / **Reference**, using the table below as a starting point — my read of the sheet clearly showed these; fill in whichever of your 18 I didn't cover

| Sheet (as I found it) | Type | Feeds |
|---|---|---|
| Dashboard | Computed | Everything below it |
| Everything | Computed view | Bills + Debts |
| 1. Bills | Core data | — |
| 2. Debts | Core data | — |
| 3. Spending | Core data | — |
| Accounts | Core data | — |
| Balances | Core data | — |
| Strategy | Computed | Debts |
| Payment Schedule | Core data + computed | Debts |
| *(daily cash-flow tab)* | Core data | Not yet scoped — see "Known Gaps" |
| *(your remaining ~8 tabs)* | ? | Fill in |

**Milestone:** You have working logins for Lovable, Supabase, and GitHub, Node is installed, your Play Console account is submitted, and you've got a complete list of your real 18 tabs categorized.

---

## Phase 1 — Core Data Model & Shared Login

**Goal:** Get the database structure and shared (2-person) login working before any real feature-building starts.

### 1a. Create the core schema in Supabase

In your Supabase project, open the **SQL Editor** and run:

```sql
-- The shared unit both of you belong to
create table households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Our Household',
  created_at timestamptz not null default now()
);

-- Links each login to a household
create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text,
  role text not null default 'member', -- 'owner' | 'member'
  created_at timestamptz not null default now(),
  unique (household_id, user_id)
);

-- Shared lookup used by bills, debts, and spending
create table categories (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  domain text not null, -- 'bill' | 'debt' | 'spending'
  parent_category text, -- optional sub-grouping (was "Cat2" in your sheet)
  created_at timestamptz not null default now()
);

-- Institutions — anything you have a login/relationship with: banks, subscriptions, lenders,
-- utilities, tools, medical providers. Not every institution has an actual balance (a subscription
-- doesn't) — that's what the separate `accounts` table below is for.
create table institutions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null, -- USAA, PetCo, POPFit, etc.
  institution_type text not null check (institution_type in
    ('bank','credit_card','lendor_lessor','financial','tool','medical','utility','subscription','other')),
  category_id uuid references categories(id), -- reuses the same categories table as Spending —
    -- e.g. PetCo -> Pets, so subscription costs roll up into the same budget bucket as manual
    -- spending in that category. Nullable; mainly meaningful for subscription/utility/lendor types.
  login_url text,
  login_username text, -- low sensitivity, fine to store directly
  sign_in_with_google boolean not null default false,
  description text, -- your sheet's "What Am I?" — a short identity tag, distinct from notes
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- Deliberately no password column — see the plan's Phase 1 discussion of why that one stays in a
-- real password manager instead of this database.

-- Accounts — the actual balance-bearing things underneath an institution (Checking, Savings, a
-- specific credit card). Not every institution gets one of these.
create table accounts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  institution_id uuid not null references institutions(id) on delete cascade,
  name text not null, -- "Checking", "Savings", "Visa Signature"...
  account_type text not null, -- 'checking' | 'savings' | 'investment' | 'retirement' | 'credit' | 'loan' | 'other'
  account_subtype text, -- "Sub Type" on your sheet: Roth IRA, Brokerage, etc.
  account_number text, -- moderate sensitivity — your call given RLS already scopes this to your household
  interest_apy numeric(6,3),
  credit_limit numeric(12,2), -- for credit accounts; also enables a utilization % calc
  is_spendable boolean not null default true, -- excludes retirement/investment from spendable totals
  include_in_net_worth boolean not null default true,
  starting_balance numeric(12,2) not null default 0, -- balance the day you start tracking this account in the app
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Historical balance snapshots -> an occasional "true this up against my real bank" checkpoint
create table account_balances (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references accounts(id) on delete cascade,
  balance numeric(12,2) not null,
  as_of_date date not null default current_date,
  created_at timestamptz not null default now()
);

create table bills (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  category_id uuid references categories(id),
  account_id uuid references accounts(id),
  amount numeric(12,2) not null,
  next_due_date date not null, -- replaces due_day — an anchor date, since not every bill is monthly
  billing_cycle text not null default 'monthly'
    check (billing_cycle in ('monthly','biweekly','quarterly','bimonthly','annually','custom')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','cleared')),
  manual_or_auto text,
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- No paid_with column — which account paid a given cycle is transactions.account_id via
-- linked_bill_id, which is more accurate than a single field that only reflects the latest guess.

create table debts (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  name text not null,
  category_id uuid references categories(id), -- from your sheet's "Cat2" — the universal categories
  debt_type text, -- broad debt nature (Medical, Credit Card, Loan, Other, Advance) — your sheet's
    -- "Category" column, not Cat2. The old separate "Type" column (Car Loan/Student Loan/Mortgage...)
    -- doesn't persist — that only existed to avoid breaking an imported spreadsheet's formulas.
  account_id uuid references accounts(id),
  starting_balance numeric(12,2) not null,
  program_start_balance numeric(12,2), -- balance when you started the payoff plan, if different
  remaining_balance numeric(12,2) not null,
  minimum_payment numeric(12,2) not null,
  interest_rate numeric(6,3) not null default 0, -- APR, as a percentage
  known_finance_charge numeric(12,2), -- only for the handful of debts where you have an exact,
    -- document-sourced finance charge that doesn't follow simple amortization (small/odd loans,
    -- leases). The calculator should use this over its own estimate when it's present.
  due_day int not null check (due_day between 1 and 31),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','cleared')),
  on_payment_plan boolean not null default false, -- your sheet's "Status" dropdown, reduced to the
    -- one value that isn't derivable elsewhere. "Due"/"Overdue" are computed live from due_day +
    -- payment_status; "Paid Off" is derived from date_paid_off is not null.
  manual_or_auto text,
  priority_order int, -- used later by the "Custom" strategy
  notes text,
  date_paid_off date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
-- No paid_with column here either — same reasoning as bills. For a payroll deduction that never
-- touches a real bank balance, add an institution (e.g. "Employer / Payroll", type 'other') with
-- one account underneath it ("Payroll Deduction", is_spendable = false, include_in_net_worth =
-- false) so it still flows through transactions.account_id uniformly. Your actual HSA is
-- different — it holds real money, so it should be its own institution (your HSA provider) with
-- a real account underneath (is_spendable is your call, but include_in_net_worth = true, since
-- it's real money you own even if payroll deposits are what funds it).

-- The running ledger: every bill payment, debt payment, and manual entry lands here.
-- An account's balance = its most recent account_balances snapshot (or starting_balance if no
-- snapshot exists yet) + sum(amount) of transactions dated after that snapshot's as_of_date.
--   current balance   -> only sum transactions where status = 'cleared'
--   spendable balance -> sum transactions where status in ('cleared','pending')
-- amount is signed: negative = money out, positive = money in
create table transactions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  account_id uuid not null references accounts(id),
  amount numeric(12,2) not null,
  status text not null default 'cleared' check (status in ('pending','cleared')),
  category_id uuid references categories(id), -- for non-bill/debt spending
  linked_bill_id uuid references bills(id),
  linked_debt_id uuid references debts(id),
  description text,
  transaction_date date not null default current_date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

**Why this is simpler than your sheet, not just different:** your Debts tab had ~29 columns. About a dozen of them (`% PD`, `Progress`, `Est Rem Bal`, `Overdue Amt`, `Status`, `Pmts Made`, `No. Pmts Rem`, `Finance Charge`, `Total Repayable`, `No of Pmts`...) are *formula outputs*, not real data. In an app, those get calculated live from the real fields whenever the screen loads — so there's nothing to keep in sync, and nothing that can silently drift out of date the way a copy-pasted formula sometimes does.

**Where `payment_status` and `transactions` come from:** these two additions support pending/cleared tracking and a running balance (see Phase 3.5 and Phase 4.5) — `payment_status` replaces a simple paid/unpaid checkbox with a real 3-state status, and every bill payment, debt payment, or manual entry becomes one row in `transactions`, which is what your spendable balance gets computed from.

> **Already ran an earlier version of this SQL?** If you built Phase 1 before this update and it used `is_paid_this_cycle boolean`, run this migration instead of recreating anything:
> ```sql
> alter table bills drop column is_paid_this_cycle,
>   add column payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','cleared'));
> alter table debts drop column is_paid_this_cycle,
>   add column payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','cleared'));
> alter table accounts add column starting_balance numeric(12,2) not null default 0;
> -- then run the `create table transactions (...)` block above as-is
> ```

### 1b. Lock down access with Row-Level Security

Still in the SQL Editor:

```sql
-- Helper: is the current logged-in user a member of this household?
create or replace function is_household_member(hid uuid)
returns boolean as $$
  select exists (
    select 1 from household_members
    where household_id = hid and user_id = auth.uid()
  );
$$ language sql security definer stable;

alter table households enable row level security;
create policy "member can view household" on households for select
  using (is_household_member(id));

alter table household_members enable row level security;
create policy "member can view household roster" on household_members for select
  using (is_household_member(household_id));

-- Everything else with a direct household_id column follows the same rule:
do $$
declare
  t text;
begin
  foreach t in array array['categories','institutions','accounts','bills','debts','transactions']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy "household access" on %I for all using (is_household_member(household_id)) with check (is_household_member(household_id));',
      t
    );
  end loop;
end $$;

-- account_balances doesn't have its own household_id — it inherits one through accounts
alter table account_balances enable row level security;
create policy "household access via account" on account_balances for all
  using (exists (
    select 1 from accounts
    where accounts.id = account_balances.account_id
    and is_household_member(accounts.household_id)
  ))
  with check (exists (
    select 1 from accounts
    where accounts.id = account_balances.account_id
    and is_household_member(accounts.household_id)
  ));
```

- [ ] Run both SQL blocks above in the Supabase SQL Editor, top to bottom
- [ ] In Supabase → **Authentication → Users**, manually create 2 users: you and the other person (email + password is simplest to start)
- [ ] Copy each user's UUID from that Users table, then run this as one statement (a CTE chains both inserts together so there's no id to manually copy-paste — that step is an easy place to slip up, since pasting a literal `<household-id>` placeholder instead of a real UUID will error):
  ```sql
  with new_household as (
    insert into households (name) values ('Our Household') returning id
  )
  insert into household_members (household_id, user_id, display_name, role)
  select id, '<your-user-uuid>'::uuid, 'You', 'owner' from new_household
  union all
  select id, '<other-person-user-uuid>'::uuid, '<Their Name>', 'member' from new_household;
  ```
- [ ] Seed your spending categories — this is really two levels (an item, and the broader category it rolls up to), which is exactly what `parent_category` is for. Here's what I could see in your "3. Spending" tab as a starting template; add whatever else is actually in there following the same pattern (there are likely more under Auto, Business, Education, Entertainment, Financial, and Travel that I didn't have visibility into):
  ```sql
  insert into categories (household_id, name, domain, parent_category)
  select (select id from households limit 1), name, 'spending', parent
  from (values
    ('Snacks & Drinks', 'Food'),
    ('Green', 'Health'),
    ('Health & Wellness', 'Health'),
    ('Home & Garden', 'Home'),
    ('Medical', 'Medical'),
    ('Shopping', 'Misc'),
    ('Misc', 'Misc'),
    ('Fees', 'Misc'),
    ('Legal', 'Misc'),
    ('Cash & Checks', 'Misc'),
    ('Personal Care', 'Personal'),
    ('Kitten', 'Personal'),
    ('Pets', 'Pets'),
    ('Smoking', 'Puff'),
    ('Vaping', 'Puff'),
    ('Emergency Fund', 'Savings'),
    ('Travel', 'Savings'),
    ('Gifts/Holidays', 'Savings'),
    ('Vehicle', 'Savings'),
    ('General', 'Savings'),
    ('Taxes', 'Savings')
  ) as t(name, parent);
  ```
  A few of these (`Medical`, `Misc`, `Pets`) have the same value for both the item and its parent — that's fine, it just means that category doesn't split into sub-items on your sheet.

### 1c. Start the Lovable project

- [x] Create a new Lovable project and paste this as your first prompt:

```
Build a household budget and debt-payoff tracker Android app called [Ledger — pick your own name].
It's shared between exactly 2 people who each log in with their own account, but see the same
household's data — not two separate personal budgets. Use email/password login.

Core data (already exists in a connected Supabase project): households, household_members,
categories, institutions, accounts, account_balances, bills, debts, transactions. institutions is
anything you have a login with (banks, subscriptions, lenders); accounts is the balance-bearing
things underneath an institution (Checking, Savings) — not every institution has one. transactions
is a running ledger — every bill payment, debt payment, and manual entry is a signed amount
(negative = money out) with a status of 'pending' or 'cleared'. Don't build the transaction-entry
UI yet, just be aware of the table shapes.

Build these screens with a bottom navigation bar (mobile-first — this will later be wrapped as
an Android app, so use large tap targets and simple, thumb-friendly layouts):

1. Dashboard — total monthly bills, total monthly debt payments, income vs obligations, and a
   list of anything overdue
2. Everything — a single filterable/sortable list combining Bills + Debts, with a checkbox to
   mark each paid, and a "reset for new month" action that clears the paid checkboxes
3. Bills — full list with add/edit/delete
4. Debts — full list with add/edit/delete, including remaining balance, interest rate, and
   minimum payment
5. Accounts & Balances — list of accounts with their latest balance, and a way to log a new
   balance snapshot over time

Every table has a household_id, and Supabase Row-Level Security already restricts each household
to its own members — don't build any single-user-only logic, both logins should always see
identical shared data.
```

- [x] **Before creating the Lovable project**, know this up front: Lovable defaults every new project to **Lovable Cloud** (its own hidden backend), and once that's enabled there is currently no official way to disconnect it and switch to your own Supabase project — it's a one-way decision made at project creation, not a setting you flip later. So the very first message to a new project needs to say so explicitly:
  ```
  Important: do not use Lovable Cloud for this project. I already have my own Supabase
  project set up, and I'll connect it directly.
  ```
  Put this at the top of the Phase 1c scaffold prompt below, in the same message — not as a separate prompt afterward.
- [x] Once the project exists without Cloud auto-enabled, connect your own Supabase project via **Settings → Connectors → Supabase** (or the Cloud icon → "Already have a Supabase project? Connect it here"), using the Project URL + anon key from Project Settings → API
- [x] Sanity check: ask in the Lovable chat "what tables can you see in the connected database?" — it should list `households`, `household_members`, `categories`, etc. If it comes back empty, it's still on the wrong backend
- [x] Connect the project to GitHub (Settings → GitHub → Connect) so you have version history and can export code later in Phase 7
- [x] Log in as both users in the Lovable preview and confirm you both land on the same (currently empty) Bills/Debts screens

**Milestone:** Both of you can log into the same shared, empty household. Bills, Debts, and Accounts screens exist and can add/edit/delete rows.

---

## Phase 2 — Import Your Real Data (One-Time)

**Goal:** get your actual bills, debts, accounts, and balances into the app and verified — nothing gets retired yet.

- [x] Export "1. Bills" as CSV from Google Sheets (File → Download → CSV)
- [x] Export "2. Debts" as CSV
- [x] Export "Accounts" as CSV
- [x] Export "Balances" as CSV
- [x] Clean each CSV: delete any formula/helper columns that don't correspond to a real stored field (see the mapping table below for Debts), and rename headers to match the schema column names

**Debts column mapping** (your sheet → the `debts` table) — see the CSV cleanup discussion later in this doc for the full reasoning behind this version:

| Your sheet column | Maps to | Notes |
|---|---|---|
| Name | `name` | |
| Cat2 | `category_id` | the universal categories, shared with Spending/Institutions |
| Category | `debt_type` | broad debt nature (Medical, Credit Card, Loan, Other, Advance) — different from Cat2 |
| Type | *(don't import)* | only existed for an imported spreadsheet's formulas; doesn't persist |
| Due | `due_day` | |
| Remaining Balance | `remaining_balance` | balance as of your last manual check |
| Starting Balance | `starting_balance` | |
| Start Bal For Debt Payoff Program | `program_start_balance` | |
| Interest Rate | `interest_rate` | |
| Min Payment | `minimum_payment` | |
| Pd this month / Pd Status | `payment_status` | map checked → `'cleared'`, unchecked → `'unpaid'` (nothing from a past import should land as `'pending'` — that state is for payments you submit going forward) |
| Status | `on_payment_plan` | `true` only if the value is "On Payment Plan" — Due/Overdue/Paid Off are computed elsewhere, not stored |
| Paid With | *(don't import)* | which account paid something is `transactions.account_id` going forward, not a static field. For "Paycheck deduction," see the Payroll/HSA note above the transactions table |
| Man/Auto | `manual_or_auto` | |
| Order | `priority_order` | |
| Notes | `notes` | |
| Date Paid Off | `date_paid_off` | |
| Account | `account_id` | look up/create the matching account row |
| Lnk, Est Rem Bal, Overdue Amt, Pd Status (formula), % PD, Progress, No of Pmts, No. Pmts Rem, Total Repayable | *(drop — computed live in-app, see Phases 5–6)* | |
| Pmts Made | *(drop)* | derived from `transactions` once the ledger is running; backfill a few historical `transactions` rows if you want continuity |
| Finance Charge | `known_finance_charge` | real, document-sourced figures — you confirmed these are exact numbers pulled from actual accounts/documents, not estimates, so they're worth keeping |

Bills follow a similar pattern, with two differences worth calling out: **`Due` + `Cycle`** together map to `next_due_date` + `billing_cycle` (not a single `due_day` — see the CSV cleanup discussion for why non-monthly bills need an actual anchor date), and **`Paid With` doesn't get imported** for the same reason as Debts above. Otherwise: map `Name`, `Category`, the payment amount, `Account`, `Status` → `payment_status`, `Auto` → `manual_or_auto`, and `Notes` directly, and drop `Lnk`, `Monthly Amount`, `Open`, and `Overdue Amt` as computed/helper columns.

- [x] Import each cleaned CSV via Supabase → **Table Editor** → your table → **Insert → Import data from CSV**
- [x] Spot-check at least 5 bills and 5 debts against the live Google Sheet for accuracy
- [x] Your old "Accounts" sheet is really two destinations now: institution-level facts (name, Type → `institution_type`, Category → `institutions.category_id`, login URL, username, "Sign in with Google," description, notes) go into `institutions`; **do not** import an actual password column — keep that in a password manager and just bring over the login URL
- [x] Your old "Account Balances" sheet is also two destinations: `balance` + `as_of_date` become new rows in `account_balances`, while everything else (nickname, account type/subtype, APY, credit limit, spendable flag, net-worth flag) is a one-time value on the matching row in the new `accounts` table — not repeated on every snapshot. Each `accounts` row also needs its `institution_id` set to whichever institution it belongs under (e.g. the Checking and Savings accounts both point at your USAA institution row)

**Milestone:** Your real bills, debts, accounts, and balances are live in the app and match the sheet.

---

## Phase 3 — "Everything" View & Basic Dashboard

- [x] In Lovable, prompt:

```
On the Everything screen, add filtering by category and sorting by due date or amount. The
"paid" checkbox should update the same underlying bill/debt row (not a separate copy), so it
stays in sync everywhere else the item appears.

Bills each have their own billing_cycle (monthly, biweekly, quarterly, bimonthly, annually) and
next_due_date — they don't all reset together. When a bill's payment_status is set to 'cleared',
advance its next_due_date by its billing_cycle interval and set payment_status back to 'unpaid'
for the new cycle, rather than using one global "reset for new month" button for every bill.
Debts, which are always monthly, can still use a simple monthly reset action for their
payment_status.

On the Dashboard, show: total monthly bills, total monthly debts, total of both combined, and
a list of anything overdue (next_due_date/due_day already passed and not marked paid), sorted
soonest-overdue first.
```

- [x] Test: mark a bill paid on the Bills screen, confirm it shows as paid on the Everything screen too (same row, not a duplicate)
- [x] Test that clearing a biweekly bill advances its due date by 14 days, not to next month
- [x] Cross-check the overdue list against 2–3 items you know are actually overdue on the real sheet right now

**Milestone:** Everything list + Dashboard totals are working and match reality.

---

## Phase 3.5 — Pending/Cleared Status & Spendable Balance

**Goal:** replace the simple paid/unpaid checkbox with a real submitted-but-not-cleared state, show a "spendable" balance that already accounts for money you've committed but your bank hasn't processed yet, and allow a mis-click to be fully undone.

**How this works, in plain terms:** submitting a bill/debt payment creates a `transactions` row with `status = 'pending'` — that amount is immediately subtracted from that account's *spendable* balance, even though your bank hasn't shown it yet. When the payment actually clears (you see it hit your real bank), you flip it to `status = 'cleared'` — from then on it's just part of history. Nothing ever gets double-counted, because `cleared` doesn't trigger a second automatic balance change — it just stops being "pending." Bills and debts reference `institution_id`, not `account_id` (ADR-006) — since an institution can have zero, one, or many accounts, the paying account is resolved at the moment you submit a payment, not stored on the bill/debt itself (ADR-007). "Undo" is a deliberate, narrow exception to "transactions are permanent history" — it fully reverses an accidental clear, rather than recording it as a correction (ADR-008).

- [x] Prompt used in Lovable:

```
Replace the simple paid checkbox on Bills and Debts with a 3-state payment status:
unpaid → pending → cleared.
When I mark a bill or debt as "submitted" (pending): resolve the paying account first — bills/debts reference institution_id, not account_id, so look up accounts under that institution. If exactly one exists, use it automatically. If multiple exist, prompt me to choose. If none exist, block the action and tell me to add an account to that institution first. Once resolved, create a row in transactions with status='pending', that account_id, amount = -amount (negative), linked_bill_id or linked_debt_id set accordingly, and set the bill/debt's payment_status to 'pending'.

When I mark it "cleared": update that same transaction row's status to 'cleared' (don't create a new row). For bills, advance next_due_date by the bill's own billing_cycle (monthly +1 month, biweekly +14 days, quarterly +3 months, bimonthly +2 months, annually +1 year, custom → don't auto-advance) and set payment_status back to 'unpaid' for the new cycle. For debts, set payment_status to 'cleared' and reduce remaining_balance by the transaction amount.
Add "Undo" as a full reversal, usable right after a clear: delete the linked transactions row, reset payment_status to 'unpaid', and revert next_due_date (bills, by reversing the same billing_cycle interval) or remaining_balance (debts, by adding the amount back). This is the one case where a transaction row gets deleted — everywhere else, transactions are permanent history and resets must never delete them.
On the Accounts & Balances screen, show two numbers per account. Both start from the same anchor: the account's most recent account_balances snapshot (or starting_balance if it has no snapshot yet), plus transactions dated after that snapshot's as_of_date:
- Current balance = anchor + sum of 'cleared' transaction amounts since the anchor
- Spendable balance = anchor + sum of 'cleared' AND 'pending' transaction amounts since the anchor
Label them clearly so it's obvious which is which.
```

- [x] Test: submit a bill payment, confirm the linked account's spendable balance drops immediately while the current balance doesn't change yet
- [x] Test: mark it cleared, confirm it now shows in "current balance" too and isn't double-subtracted, and next_due_date advances by the correct billing_cycle interval (not a flat +1 month)
- [x] Test: account auto-selected when the institution has exactly one account; prompted when it has multiple; blocked with a message when it has none
- [x] Test: Undo after a clear removes the transaction and reverts next_due_date/remaining_balance
- [ ] Point the Everything screen's paid toggle at this same logic (`src/lib/payments.ts`) — currently still on its own older direct-status toggle
- [ ] Decide (just for yourselves, nothing to build): who marks payments as submitted vs. cleared, and how often you'll check for things that need clearing — this is a habit question as much as a feature

**Milestone:** Bills and debts have real pending/cleared status, correct per-bill due-date advancement, resolved account attribution, a working full undo, and each account shows an accurate spendable balance.

---

## Phase 4 — Spending & Budget Tracking

### 4a. Extend the schema

```sql
create table spending_budgets (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid not null references categories(id),
  budgeted_amount numeric(12,2) not null default 0,
  updated_at timestamptz not null default now(),
  unique (household_id, category_id)
);

create table spending_actuals (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  category_id uuid not null references categories(id),
  month date not null, -- first of month, e.g. 2026-07-01
  actual_amount numeric(12,2) not null default 0,
  created_at timestamptz not null default now(),
  unique (household_id, category_id, month)
);

do $$
declare
  t text;
begin
  foreach t in array array['spending_budgets','spending_actuals']
  loop
    execute format('alter table %I enable row level security;', t);
    execute format(
      'create policy "household access" on %I for all using (is_household_member(household_id)) with check (is_household_member(household_id));',
      t
    );
  end loop;
end $$;
```

- [x] Run the SQL above in Supabase

### 4b. Build the screen

- [x] Prompt in Lovable:

```
Add a Spending screen listing my budget items, grouped by their parent_category (e.g. "Smoking" and "Vaping" both roll up under "Puff"). For each item show 3 columns: Budgeted amount, Current month actual, and 3-month average (computed by averaging the last 3 months of actuals for that item — don't store the average, calculate it on load). Show a subtotal per parent_category group, and a grand total at the bottom. Let me edit the budgeted amount and log the current month's actual spend per item. Add a "start new month" action that locks in the current month's actuals as history and opens a fresh entry for the new month.
```

- [x] Enter this month's real budget numbers and compare both the per-item numbers and the parent-category subtotals to your "3. Spending" tab

**Milestone:** Spending/budget tracking works and matches the sheet.

---

## Phase 4.5 — Quick Transaction Entry & Running Balance

**Goal:** a fast way to log everyday, non-bill/debt spending (groceries, gas, a deposit) that immediately updates the running balance — no bank connection, just quick manual entry. This uses the same `transactions` table from Phase 3.5, so bill payments, debt payments, and everyday spending all live in one ledger.

- [x] Prompt in Lovable:

```
Add a quick "Add Transaction" action, reachable from one tap on every main screen (a floating
action button is fine). It should ask for only 4 things: account, amount, category (optional —
only for non-bill/debt spending), and a short description. Default the date to today and the
status to 'cleared' (most manual entries like "bought groceries" are already final; only bill/
debt submissions from Phase 3.5 typically start as 'pending'). Saving it inserts a row into
transactions and immediately updates that account's balance everywhere it's shown.

On the Accounts screen, show a running list of recent transactions per account (like a bank
statement) so I can see what happened, not just the current total.

For any transaction with a category set, also roll it into that category's current-month
actual on the Spending screen, so I don't have to separately type in a monthly total for
categories I'm already logging transactions for. If a category has no logged transactions in
a given month, keep allowing the manual monthly total from Phase 4 as a fallback.
```

- [x] Test: log a $20 grocery purchase, confirm the account balance updates immediately and (if categorized) the Spending screen reflects it without double-entry
- [x] Decide which categories you'll log transaction-by-transaction vs. which you'll keep entering as a single monthly total (Phase 4's original method) — mixing both is fine, just avoid doing both for the *same* category in the *same* month, or it'll double count

**Bonus this unlocks:** since every transaction is dated, your net worth history (Phase 6) can now be reconstructed for any past date directly from the ledger, instead of depending only on manually re-entered balance snapshots.

**Milestone:** You can log a transaction in a few taps, and account balances update immediately without retyping a whole new balance.

---

## Phase 5 — Debt Payoff Strategy Calculator

This is the most custom piece of logic in the whole project — it's worth extra care and testing here.

**Note:** this phase originally called for a separate `debt_payments` table — that's no longer needed, since Phase 3.5 already introduced `transactions`, and a cleared debt payment is just a transaction with `linked_debt_id` set. One ledger instead of two keeps payment history in exactly one place.

### 5a. Extend the schema

```sql
create table debt_strategy_settings (
  household_id uuid primary key references households(id) on delete cascade,
  active_strategy text not null default 'none', -- 'none' | 'snowball' | 'avalanche' | 'custom'
  extra_monthly_payment numeric(12,2) not null default 0,
  updated_at timestamptz not null default now()
);

alter table debt_strategy_settings enable row level security;
create policy "household access" on debt_strategy_settings for all
  using (is_household_member(household_id))
  with check (is_household_member(household_id));
```

*(If you already built the original version of this phase with a `debt_payments` table: `drop table debt_payments;` — the transactions from Phase 3.5 already cover this, since debt payments there get `linked_debt_id` set.)*

### 5b. Build the calculator

- [x] Prompt in Lovable:

```
Build a debt payoff calculator on a new Debt Strategy screen. Given all active debts (balance,
interest rate, minimum payment) and an optional extra monthly payment amount, calculate three
scenarios:

- Avalanche: pay debts off in order of highest interest rate first
- Snowball: pay debts off in order of lowest balance first
- Custom: pay debts off in the manual priority_order field I set on each debt

For each scenario, show: months until debt-free, total interest paid, and total money saved
compared to paying only the minimums on everything. Show all three side by side in a
comparison table. Let me set which strategy is "active" and the extra payment amount, saved
to debt_strategy_settings.

Payment history for a debt is: transactions where linked_debt_id = that debt and
status = 'cleared'. Use that to show payments made so far — don't build a separate payment log.

A few debts have a known_finance_charge value (an exact figure pulled from real loan/lease
documents, for debts where standard amortization math doesn't quite apply). When it's set, use
that number directly for that debt's total-interest figure instead of your own calculated
estimate — it's more accurate than the projection for those specific debts.
```

- [x] **Validation checkpoint — do not skip this:** compare the app's Avalanche/Snowball/Custom output (total interest, payoff date, money saved) against your sheet's "Strategy" tab numbers. These should match closely. If they're meaningfully different, the amortization math has a bug — this is the one place in this whole project worth debugging carefully before moving on.
- [x] Note: payment *counts* prior to your migration date won't be perfectly reconstructed unless you manually backfill a few `transactions` rows with past dates — the balances themselves are still accurate either way.

**Milestone:** Calculator output matches your sheet's Strategy tab.

---

## Phase 6 — Payment Schedule & Charts

- [ ] Prompt in Lovable:

```
Add a Payment Schedule screen showing, month by month for the next 12 months, which debts get
paid and how much, based on the household's active strategy and extra payment amount. Let me
check off a month once all its payments are actually made.

Add charts to the Dashboard:
- A net worth trend line: for each account, balance as of any past date is the most recent
  account_balances snapshot before that date (or starting_balance if none exists yet), plus
  the sum of 'cleared' transactions between that snapshot and the target date. Group by
  account_type.
- A spending-by-category chart for the current month
- A payoff-progress bar per debt: (starting_balance - remaining_balance) / starting_balance
```

- [ ] Compare the net worth number against your sheet's current total
- [ ] Confirm the per-debt progress bars look right against a couple of debts you know the history of

**Milestone:** Payment Schedule and charts are working.

---

## Phase 7 — Wrap as a Real Android App (Capacitor)

- [ ] Clone your GitHub repo locally: `git clone <your-repo-url>`
- [ ] `cd` into the project folder
- [ ] `npm install`
- [ ] `npm install @capacitor/core @capacitor/cli @capacitor/android`
- [ ] `npx cap init "Ledger" "com.yourhousehold.ledger"` (pick your own app name and package ID — the package ID can't be changed later without republishing as a new app)
- [ ] `npm run build`
- [ ] `npx cap add android`
- [ ] `npx cap sync android`
- [ ] `npx cap open android` (this opens Android Studio)
- [ ] In Android Studio: set the app icon and splash screen, set `versionCode`/`versionName`
- [ ] **Build → Generate Signed Bundle / APK** — create a new keystore when prompted
- [ ] **Back up that keystore file somewhere safe outside this project** (a password manager or encrypted backup) — if you lose it, you cannot publish updates to this app ever again under the same listing
- [ ] Install the signed build directly onto both of your phones (via USB debugging, or Android Studio's Run button) and test everything end-to-end before touching the Play Store

**Milestone:** The app is installed and working on both phones as a real Android app — before it's ever in the Play Store.

---

## Phase 8 — Publish to Google Play (Internal Testing)

Since this is a 2-person app, use the **Internal Testing** track rather than a full public release — it skips a lot of the public store-listing overhead while still installing exactly like a real Play Store app.

- [ ] Confirm your $25 Play Console registration from Phase 0 is approved
- [ ] Create the app listing in Play Console: name, short description, full description, icon, at least 2 screenshots
- [ ] Write a short privacy policy (even a single paragraph is fine — cover what data is collected, that it's not sold or shared with third parties, and that it's stored via Supabase) and host it somewhere public — a free GitHub Pages page works well. **Play Console requires this URL even for a private 2-person app.**
- [ ] Fill out the **Data Safety** form honestly — this app collects financial information, it isn't shared with third parties, and it's stored via your Supabase project
- [ ] Under **Testing → Internal testing**, upload the signed `.aab` from Phase 7
- [ ] Add both of your Google account emails as internal testers
- [ ] Share the opt-in testing link Google generates with the other person; both of you install from the actual Play Store via that link

**Milestone:** The app is installed from the real Google Play Store on both phones.

---

## Phase 9 — Cutover: Retire the Sheet

- [ ] Re-check the live Google Sheet one more time for anything edited since your Phase 2 import, and bring those changes into the app
- [ ] Move the Google Sheet to an archive folder or set it to read-only — don't delete it, just stop editing it
- [ ] Use the app exclusively for at least 2 weeks before fully trusting it as your only record
- [ ] Once you're confident, you're done — the app is now the single source of truth

**Milestone:** Sheet retired. App is the source of truth.

---

## Reference: Testing & Validation Checklist

- [ ] Debt strategy calculator numbers match the sheet's Strategy tab (Phase 5)
- [ ] Log in as the second user and confirm they see the *same* data as the first — not an empty/separate account
- [ ] Marking something paid on one screen updates it everywhere else it appears
- [ ] The monthly reset action doesn't delete historical data, only clears "paid"/status flags
- [ ] Net worth and spending totals match the sheet's Dashboard tab
- [ ] Submitting a payment (pending) drops spendable balance immediately without touching current balance; clearing it doesn't double-subtract (Phase 3.5)
- [ ] A quick transaction updates the account balance and (if categorized) the Spending screen, without needing a separate manual monthly entry for that same category/month (Phase 4.5)
- [ ] The app requires an internet connection — there's no offline mode in this plan (see Known Gaps)

---

## Known Gaps & Things You'll Decide Along the Way

- **The daily cash-flow tab** (the Thu–Mon "NEED/MATH/MADE/LEFT" style tracker near the end of your workbook) isn't scoped into a phase above — decide whether it folds into the Spending screen (Phase 4) or becomes its own later addition.
- **Any of your 18 tabs I didn't get full visibility into:** I re-pulled the sheet after you unhid everything, and it didn't surface meaningfully more than before — the sheet's own internal "Guide to Sheets" legend only documents the 9 tabs already reflected in this plan (Dashboard, Everything, 1. Bills, 2. Debts, 3. Spending, Accounts, Balances, Strategy, Payment Schedule). The other ~9 are likely small helper/lookup/archive tabs not meant for direct editing, which is probably why they were hidden and undocumented in the first place. If any of them actually matter to you, the fastest path is just telling me their names/purpose directly rather than me re-pulling the export again.
- **Historical payment counts:** going forward, every payment logged in the app is tracked precisely. Payments made *before* your migration date won't be reconstructed automatically unless you manually backfill a few `transactions` rows.
- **Offline use:** this plan assumes always-online (Supabase requires a network connection). Offline-first support is a real but non-trivial addition — worth a separate project later if it matters to you.
- **Push notifications for due bills:** not built in this plan, but Capacitor supports it (`@capacitor/push-notifications`) if you want to add it later.

---

## Reference: Ongoing Costs After Launch

| Item | Ongoing cost |
|---|---|
| Lovable | $0/mo once you stop actively using it to build new features (your code is already exported to GitHub) |
| Supabase | $0/mo on the free tier, essentially indefinitely for 2 users |
| Google Play | $0 — the $25 fee never renews |
| Capacitor / Android Studio | $0 — always free |

The only time you'll spend money again is if you resubscribe to Lovable for a future round of new features, or (unlikely) your usage somehow outgrows Supabase's free tier.

---

## Reference: Using Kiro (or Other Local AI Coding Tools) Alongside This Project

**Short answer: useful for one specific slice of this project, not as a general Lovable replacement — and its own free tier won't fully solve running out of Claude usage either.**

**What Kiro actually is:** an AWS-backed IDE (built on VS Code), Claude-powered under the hood, built around three ideas — specs (requirements/design/task breakdown, saved as markdown in your repo), steering files (project conventions the agent reads on every task, so you don't re-explain context each time), and hooks (event-driven automations, e.g. on file save or commit). Free tier: 50 credits/month, no card required — enough for maybe 5–10 medium tasks, not a durable daily-driver allowance. Because it's Claude-powered under the hood, it's a genuinely separate usage pool from claude.ai/Claude Code (different company, different billing), which does satisfy "a way to keep working when Claude's free plan is maxed" — just don't expect it to be a large reserve on its own.

**Where it's genuinely useful here:** the parts of this project that already happen *outside* Lovable's own environment — Phase 7's Capacitor wrapping, Android Studio configuration, writing one-off scripts. That work is local by design already; Kiro (or plain VS Code, or Claude Code) is a fine place to do it, and its steering files are a good home for this `CONTEXT.md` — drop the same content in wherever Kiro's steering docs actually live (verify the exact folder in Kiro's own onboarding, since tool conventions shift) so a Kiro session gets oriented without you re-explaining the project.

**Where it's risky: editing the core Lovable-managed app code directly.** Lovable's GitHub sync is genuinely two-way — commits from any Git client, including a local Kiro/VS Code session, sync back into Lovable's editor automatically. The real risk is two agents editing the *same file* without pulling first: if Lovable's AI changes a file in the browser while you separately edit that same file locally without running `git pull` first, you get a real merge conflict that has to be resolved by hand in GitHub before Lovable will pick it back up. This isn't a hypothetical — it's the documented failure mode for exactly this kind of mixed workflow.

**The protocol, if you do use Kiro (or anything local) on the app code itself:**
- [ ] Always `git pull` before starting any local editing session — never assume your clone is current
- [ ] Don't run a Lovable prompt and a local Kiro/VS Code session at the same time
- [ ] Consider an `AGENTS.md` file in the repo root marking which files/folders are Lovable-owned vs. externally-owned (e.g. the `android/` folder from Capacitor is clearly external; `src/` is Lovable's) — this is a real, recognized convention multiple AI coding tools respect for exactly this boundary problem
- [ ] If a conflict does happen: resolve it in GitHub directly (edit the conflicting file, commit to `main`), and Lovable will pick up the resolved version on its next sync

**Bottom line:** Kiro doesn't replace Lovable for building the app's screens and logic — that's still Lovable's job, and splitting that work across two AI agents editing the same files is more likely to cause the kind of breakage you're trying to avoid than to save you real time. Its actual value here is a second, separate-quota tool for the local, non-Lovable parts of the project (Capacitor/Android work), plus a place to keep `CONTEXT.md`-equivalent project conventions loaded automatically instead of re-pasted. If the free-tier crunch is really about *this conversation* specifically, `CONTEXT.md` solves the re-explaining-everything cost regardless of which tool you hand it to next — a fresh Claude conversation with `CONTEXT.md` pasted in is a perfectly good fallback too, not just Kiro.

---

## Future Add-On: Monetizing / Selling This App

*This is explicitly a "someday" idea, not part of the build above — nothing here needs deciding now. It's here so the landscape is easy to find when you're ready to look at it seriously.*

**The good news — you're closer than you'd think.** Every table in this plan is scoped by `household_id`, and access is enforced by Row-Level Security keyed off `household_members`. That's the same core pattern real multi-tenant SaaS apps use to keep one customer's data walled off from another's. Turning this from "our app" into "an app other households could use" is mostly a product/business problem, not a rebuild.

**What would actually need to change:**
- **Onboarding.** Right now, a new household gets created by you running SQL by hand (Phase 1). A real product needs a signup flow: create account → create household → pick your own categories/accounts, with no SQL involved.
- **Genericize anything hardcoded to your household.** The seeded spending categories, the specific debt types, any copy that assumes "our" bills — all of that becomes user-configurable instead of pre-set.
- **Scale considerations.** Supabase's free tier (500MB, 50K monthly users) comfortably covers hundreds of real households; Lovable becomes irrelevant to ongoing cost once you're not actively using it to build.

**How you could actually monetize it, if you go that route:**
- **Paid upfront app** — Google Play supports a one-time purchase price. Simple, but a personal-finance app with no free trial is a hard sell to strangers.
- **Freemium + subscription (Google Play Billing)** — free core tracking, paid tier for extras (multiple households, more accounts, etc). As of mid-2026, Google's standard service fee is 10% on the first $1 million of annual earnings, applying to all auto-renewing subscriptions regardless of total revenue — using Google's own billing adds a further 5% fee (15% total), while a change effective June 30, 2026 lets US/UK/EEA developers route payments through their own checkout to avoid part of that fee, though your own payment processor then takes its own cut.
- **One-time in-app purchases** work similarly — 15% commission on the first $1 million earned annually through Google Play's billing, 30% beyond that.
- **Sell it as a template/course instead of an app** — "how I built my own household budget tracker" as a paid guide or starter template (e.g. on Gumroad or similar) sidesteps Play Store policy and revenue-share entirely, at the cost of a much smaller, more DIY audience.

**Worth knowing before you go further:** Google Play requires any app with financial features to complete a "Financial features declaration" form in Play Console, and to comply with applicable regional/local regulations and disclosures — a personal budget/debt *tracker* (not a lender) sits at the lightest end of that policy, but it does still apply. The heavier requirements (licensing documentation, APR disclosure rules) are specifically aimed at apps that issue loans or credit, which this app doesn't do. Since you'd be handling other people's real financial data at that point, it's also worth a real privacy policy and terms of service (not just the one-paragraph version from Phase 8) and, if you're serious about it, a conversation with an actual lawyer about what obligations come with that — this isn't legal advice, just a flag that the stakes are different once it's not just the two of you.

*Sources for the figures above: [Play Console: Financial Services policy](https://support.google.com/googleplay/android-developer/answer/9876821), and reporting on Google Play's 2026 billing fee changes — worth re-checking directly before making any real decisions, since Play's fee structure has been actively changing this year.*
