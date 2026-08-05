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
- Phase 6.7 partial: Paycheck-deducted debts, debt paid-off handling, bill envelopes (ADR-032, ADR-033); ADR-034 Dashboard/Spending/Snapshot work pending
- Phase 7 not started: Wrap as a Real Android App (Capacitor)
- Phase 8 not started: Publish to Google Play (Internal Testing)
- Phase 9 not started: Cutover: Retire the Sheet
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
- Schema changes are applied manually in Supabase; new columns/tables (savings_goals, transactions.linked_goal_id, households.export_format, categories.icon/color, institutions.logo_url, debts.is_paycheck_deduction, debts.cycle_paid_to_date, savings_goals.account_id/linked_bill_id) must exist before those screens work.
