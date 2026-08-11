## Project
Private shared household budget and debt-payoff Android application migrated from Google Sheets.

## Stack
- Lovable React/Vite frontend
- Self-managed Supabase PostgreSQL backend
- Supabase Auth + Row Level Security
- Capacitor Android wrapper
- Google Play Internal Testing

## Current Status
- Phase 0 complete: accounts, tools, repository
- Phase 1 complete: Core Data Model & Shared Login
- Phase 2 complete: Import Your Real Data (One-Time)
- Phase 3 complete: "Everything" View & Basic Dashboard
- Phase 3.5 complete: Pending/Cleared Status & Spendable Balance
- Phase 4 complete: Spending & Budget Tracking
- Phase 4.5 complete: Quick Transaction Entry & Running Balance
- Phase 5 complete: Debt Payoff Strategy Calculator
- Phase 6 complete: Payment Schedule & Charts
- Phase 6.5 complete: Paycheck Budget, Savings Goals, Status Snapshot & Settings
- Phase 6.6 complete: Visual restyle + category/institution visual metadata and institution totals
- Phase 6.7 complete: Paycheck-deducted debts, debt paid-off handling, bill envelopes and the bill-card "Add to envelope" action (ADR-032, ADR-033)
- Phase 6.8 complete: Universal partial payments, ledger-derived payment cycle, payment repair tools, envelope Set Aside, goal allocations (ADR-035 through ADR-039)
- Phase 6.9 complete: Generalized custom cycles, spending manual overrides + month navigator, Dashboard rework and budget/actual bills split, Snapshot balances/pay-period/summary, allocation spend hints, Payment Schedule history + per-debt status (ADR-034, ADR-040, ADR-041, ADR-042)
- Phase 7 complete: Split transactions, invoices + debt adjustments, payment fees, income deposit splits, shared institution/account dialogs (ADR-044 through ADR-047)
- Phase 8 complete: Visual consistency pass (SectionLabel/EmptyState, theme-safe hero overlays)
- Phase 9 complete: Invoice model + payment plans, arrears tracking, institution logos on obligations, graphical Dashboard/Spending, More grid, inline merchant capture (ADR-048, ADR-049, ADR-050)
- Phase 10 complete: Arrears editing, invoice numbers, merchant/place tracking, Spending by place, income source detail + splits (ADR-051 through ADR-054)
- Phase 11 not started: Wrap as a Real Android App (Capacitor)
- Phase 12 not started: Publish to Google Play (Internal Testing)
- Phase 13 not started: Cutover: Retire the Sheet
- Migration from Google Sheets has not occurred yet

## Locked Decisions
- Android only
- Two shared household users
- Household data is shared through household_id
- No Lovable Cloud backend
- Direct Supabase SQL Editor schema management
- One-time spreadsheet migration
- Bills and debts both carry billing_cycle + next_due_date; monthly debts still use due_day
- Combined spendable total counts credit accounts as available credit (ADR-023)
- Payment Schedule month check-offs are shared via payment_schedule_checkoffs
- Savings goal current_amount is derived from cleared transactions, never stored (ADR-027)
- Snapshot export uses html2canvas-pro (oklch-safe) with foreignObjectRendering; format from households.export_format (ADR-028)
- Category icon/color and institution logo_url are stored fields; institution type icon/color is a code-side map (ADR-029, ADR-030)
- Institution Current Balance / Current Due are computed on render, never stored (ADR-031)
- Debts flagged is_paycheck_deduction are tracked but excluded from obligation totals (ADR-032)
- Non-monthly bills auto-create one linked savings_goals envelope via linked_bill_id (ADR-033)
- Payment cycle state is derived from the ledger (unpaid / pending / partial / cleared), never stored; ADR-036 supersedes ADR-010
- Payable rows are updated before the ledger row is written, and updates that change 0 rows throw (ADR-037)
- Envelope Set Aside writes two cleared transactions, debit + goal-tagged credit; there is no transfer table (ADR-038)
- pay_period_allocations rows target either a category_id or a goal_id, never both (ADR-039)
- Custom billing cycles store an interval in days on bills/debts (`cycle_interval_days`); weeks are converted on save (ADR-040)
- A spending_actuals row with is_manual_override wins over the ledger sum; overrides never touch transactions (ADR-041)
- Budgeted and spent are always split into ordinary spending vs. bill-linked amounts (ADR-034)
- Split transactions share a `split_group_id`; edits delete and re-insert the whole group (ADR-044)
- Invoices are debts with the `one_time` cycle: real due date, never rolls forward, optional payment plan (ADR-045, ADR-048)
- Past due is money, not a flag: missed cycles + manual carry-in, computed in `src/lib/arrears.ts` (ADR-049)
- Payment fees write a second, unlinked "Fee: <name>" transaction and never credit the cycle (ADR-046)
- Marking income received writes the source's deposit splits as cleared transactions; the remainder row absorbs variance (ADR-047, ADR-054)
- Transactions carry an optional `institution_id` ("place"), which powers Spending by place (ADR-053)

## Important Rules
- Never store passwords.
- Transactions are the ledger source of truth.
- Account balances use snapshots plus transactions after snapshot.
- Bills and debts remain synchronized with transaction records.
- account_type is always stored lowercase.
- All bills track cycle_amount_due / cycle_paid_to_date and debts track cycle_paid_to_date; a cycle only rolls forward when fully paid (ADR-035).
- Every submit/clear prompts for the amount being paid now and may be a partial payment (ADR-035).
- Debts with known_finance_charge do not accrue interest_rate in payoff simulations.
- Credit accounts with no credit_limit are excluded from the combined spendable total and flagged on the Dashboard.
- Pay-time account picker lists ALL household accounts, defaulting to the account that last paid that bill/debt; never scoped to the vendor's institution (ADR-007 correction).
- A debt payment that zeroes remaining_balance stamps date_paid_off; paid-off debts are hidden by default.
- Institution logo_url is only ever suggested from login_url for the user to confirm — never written silently.
- A custom cycle with no cycle_interval_days throws on date math; render-only paths use shiftDateSafe().
- Payment Schedule past months are history, not a simulation: no per-debt breakdown, check-off only. Ledger status badges appear on the current month only.
- Schema changes are applied manually in Supabase; new columns/tables (savings_goals, transactions.linked_goal_id, households.export_format, categories.icon/color, institutions.logo_url, debts.is_paycheck_deduction, debts.cycle_paid_to_date, savings_goals.account_id/linked_bill_id, pay_period_allocations.goal_id, bills/debts.cycle_interval_days, spending_actuals.is_manual_override, transactions.split_group_id, bills/debts.opening_arrears, debts.invoice_number, transactions.institution_id, income_source_splits) must exist before those screens work.
