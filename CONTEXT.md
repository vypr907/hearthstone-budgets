# CONTEXT.md

**Purpose of this file:** a compact "load this first" briefing for handing this project to a fresh AI session — a new Claude conversation, Kiro, Claude Code, anything. `PLAN.md` is the full sequential build guide with the reasoning behind every decision (great for a human working through it step by step, expensive for an AI to re-read every time). This file is the current-state summary: what exists right now, what matters, and what to avoid — update it as things change so a new session can get oriented in one read instead of by re-explaining the last month of conversation.

**How to use this file:** paste its contents at the start of a new session, or point a tool at it directly (e.g. Kiro's steering files, Claude Code's `CLAUDE.md` — copy or symlink this content into whichever convention the tool actually auto-loads; a plain root-level `CONTEXT.md` isn't automatically read by every tool, don't assume it is).

---

## The project, in one paragraph

A private, shared household budget & debt-payoff tracker for 2 people, migrated from an 18-tab Google Sheets workbook to a native Android app. Built with Lovable (React/Vite frontend) + a self-managed Supabase project (Postgres + Auth + Row-Level Security) + Capacitor (Android wrapper) + Google Play (Internal Testing distribution).

## Key decisions already locked in — don't re-litigate these

- **Android only**, via Google Play Internal Testing. No iOS, no PWA.
- **Exactly 2 shared logins**, seeing identical household data — not two separate personal accounts. Enforced via `household_id` + Row-Level Security on every table.
- **One-time data migration**, then the Google Sheet gets retired.
- **Own Supabase project, not Lovable Cloud.** Lovable defaults new projects to its own hidden backend (Lovable Cloud); this project deliberately uses a separate, self-managed Supabase project instead so the schema is directly inspectable/editable in the Supabase dashboard. Once Lovable Cloud is enabled on a project there's no official way to switch off it later — any brand-new Lovable project must be told "do not use Lovable Cloud" in its very first message.
- **No Supabase CLI / migration files.** Schema changes are run directly in the Supabase SQL Editor. There is no `supabase/migrations` folder, and Supabase's own GitHub integration is deliberately not connected — nothing for it to sync.

## Current status

*(keep this section current — this is the part that goes stale fastest)*

- [x] Phase 0 — accounts, tools, GitHub repo created
- [x] Phase 1 — schema built in Supabase; Lovable project connected to it (not Lovable Cloud); scaffold prompt run
- [ ] Phase 2 — CSV cleanup in progress (see `CSV_MAPPING.md`), not yet imported
- [ ] Phases 3 onward — not started

*(update the checkboxes above as you go — this is the fastest way for a new session to know where things actually stand)*

## Full current schema

`households(id, name, created_at)`
`household_members(id, household_id, user_id, display_name, role, created_at)`
`categories(id, household_id, name, domain, parent_category, created_at)` — domain is informal text (`bill`/`debt`/`spending`), reused across bills, debts, spending, and institutions
`institutions(id, household_id, name, institution_type, category_id, login_url, login_username, sign_in_with_google, description, notes, created_at, updated_at)` — anything with a login: banks, subscriptions, lenders, utilities. No password column, ever.
`accounts(id, household_id, institution_id, name, account_type, account_subtype, account_number, interest_apy, credit_limit, is_spendable, include_in_net_worth, starting_balance, notes, created_at, updated_at)` — the balance-bearing things under an institution. Not every institution has one (a subscription doesn't).
`account_balances(id, account_id, balance, as_of_date, created_at)` — periodic snapshots only
`bills(id, household_id, name, category_id, account_id, amount, next_due_date, billing_cycle, payment_status, manual_or_auto, notes, is_active, created_at, updated_at)` — no `due_day` (replaced), no `paid_with` (superseded by `transactions`)
`debts(id, household_id, name, category_id, debt_type, account_id, starting_balance, program_start_balance, remaining_balance, minimum_payment, interest_rate, known_finance_charge, due_day, payment_status, on_payment_plan, manual_or_auto, priority_order, notes, date_paid_off, created_at, updated_at)` — no `paid_with`
`transactions(id, household_id, account_id, amount, status, category_id, linked_bill_id, linked_debt_id, description, transaction_date, created_at, updated_at)` — the running ledger; every bill payment, debt payment, and manual entry is one signed row here
`debt_strategy_settings(household_id, active_strategy, extra_monthly_payment, updated_at)`
`spending_budgets(id, household_id, category_id, budgeted_amount, updated_at)`
`spending_actuals(id, household_id, category_id, month, actual_amount, created_at)`

All tables (except `account_balances`, which inherits through `accounts`) have Row-Level Security scoped by `household_id` via an `is_household_member(hid)` helper function.

## Gotchas — things that already bit us once

- **Balance formula is snapshot-anchored, not zero-anchored:** an account's current balance = its most recent `account_balances` snapshot (or `starting_balance` if none exists) + `transactions` since that snapshot. Don't compute it as just `starting_balance + all transactions ever`.
- **`payment_status` (on bills/debts) and `transactions.status` are different columns that must stay in sync** — a bill/debt marked `cleared` should always have a corresponding `cleared` row in `transactions` via `linked_bill_id`/`linked_debt_id`.
- **Bills have independent billing cycles** (monthly/biweekly/quarterly/bimonthly/annually) — there is no single "reset for the month" button that applies to all of them. Debts are always monthly and can use a simple reset.
- **`debt_type` holds "Medical/Credit Card/Loan/Other/Advance"**, not the old "Car Loan/Student Loan/Mortgage" values — those were dropped entirely, they only existed for an old spreadsheet's formulas.
- **Never add a password column anywhere.** Login URL + username only; passwords stay in a real password manager.
- **Editing code outside Lovable (VS Code, Kiro, etc.) is safe but has one hard rule: always `git pull` before starting a local session.** Lovable's GitHub sync is genuinely two-way, but editing the same file in both places without pulling first causes a real merge conflict. See the Kiro section of `PLAN.md` for the fuller boundary (local tools are for Capacitor/Android work, not for editing the core Lovable-managed app).

## Where the rest of the detail lives

- `PLAN.md` — full phase-by-phase build plan, all reasoning, pricing, Lovable prompts, milestones
- `CSV_MAPPING.md` — the definitive sheet-column → database-column mapping for the one-time import
- `README.md` — repo-facing overview, setup, and build commands
