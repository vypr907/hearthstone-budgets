## Session Notes

- Dashboard/UX polish planning pass (Claude Code, no code edits — spec/prompt
  generation only, per user's tool-routing rules). Read CONTEXT.md, ADR-023,
  ADR-029, ADR-032, ADR-034, ADR-053/056/063/064, SCHEMA.md's
  `is_paycheck_deduction` comment before scoping each task.
  1. Dashboard grid cutoff/font — root-caused to `src/routes/app.tsx`'s
     non-safe-area-aware `pb-20` + `AddTransactionFab`'s non-safe-area-aware
     `bottom-24`, plus `BudgetTile`'s `text-[10px]` caption. Lovable prompt
     written, not yet applied.
  2. Category/split card redesign — confirmed the "boring" pattern is shared
     by `BudgetTile` (app.index.tsx) AND `SpendRow` (app.spending.tsx), NOT
     split-transaction line items (those are already fine). Proposed a
     shared `BudgetSplitLines` component, 2x2 grid direction recommended
     over dual-bars/chips alternates (used `frontend-design` skill).
  3. Paycheck Budget floating "left to allocate" — placement: fixed bottom
     bar inside `PeriodBudget` (app.paycheck.tsx), additive to the existing
     Card, safe-area coordinated with item 1's fix.
  4. Transactions search v1 — reuses the existing client-side filter-chain
     pattern in app.transactions.tsx; adds `searchQuery` (description/place
     substring) and `amountQuery` (absolute-value substring match).
  5. Tooltips — traced the "$X set aside this pay period" hero figure to
     `periodTotals.total`/`obligationsInRange` and documented the exact
     formula as a 2026-08-18 addendum to ADR-034 in DECISIONS.md. Scoped 3
     more high-ambiguity elements (Available credit, Still owed vs Past due,
     Projected badge). Recommended the existing `Popover` primitive over the
     hover-only `Tooltip` primitive, since this is a touch-first app.
  6. Dashboard reorg — reorder (Payoff Progress below Still Owed) +
     collapsible: straightforward, prompt written. Past Due Deduction/HSA
     split: **partially blocked** — `debts.is_paycheck_deduction` is a single
     combined payroll-or-HSA flag per its own SCHEMA.md comment, and bills
     have no equivalent field at all. Flagged per the session's exclusion
     rule; proposed only the binary split the existing field actually
     supports (deduction/HSA-combined vs. everything else), explicitly not
     the 3-way split the user described.
  7. Cross-account/cross-user transfers — investigate only. Finding:
     accounts have no per-user owner column (household_id only); ADR-056's
     Transfer mode already handles any account-to-account move identically
     regardless of "whose" account; Transfers deliberately have no Place
     field since nothing is being spent. Pure doc/UX-clarity gap, no ADR
     needed.
  8. Retroactive transaction renaming — investigate only. Finding: already
     works today via TransactionDetail/SplitTransactionDetail's existing
     Edit mode (description field, both single and split transactions).
     Pure discoverability gap, no ADR/implementation needed.
  Full prompts/findings delivered in chat; none of tasks 1-6 have been sent
  to Lovable yet. Files touched this session: `docs/DECISIONS.md` (ADR-034
  addendum only) — no src/ changes.

- Follow-up: resolved 4 open judgment calls with the user via AskUserQuestion
  and rewrote the affected prompts. Locked-in decisions: (2) card redesign
  is Direction B — dual `ItemBar` progress bars per Spending/Bills row, not
  the 2x2 grid or chips; (4) Transactions amount search is a min/max range
  (`amountMin`/`amountMax`, same grid layout as the existing date range),
  not substring or exact match; (6) the new collapsible Payoff Progress
  section defaults **closed** (`useState(false)`), not open; (7/8) both
  investigate-only follow-ups are being built, not left noted-only — added
  as new items 7 (Transfer mode helper text explaining no Place is needed)
  and 8 (Accounts Recent Activity rows become clickable, reusing
  `TransactionDetail` exported from app.transactions.tsx into
   app.accounts.tsx). All 8 finalized prompts are in chat history for this
   date, none sent to Lovable yet.

- Implemented all 8 mobile-polish items (no new ADRs; references ADR-023/029/
  032/034/039/049/053/056/059/060/063).
  1. Safe-area bottom clearance: `src/routes/app.tsx` `pb-[calc(6rem+env(safe-area-inset-bottom))]`,
     `AddTransactionFab` FAB `bottom-[calc(6rem+env(safe-area-inset-bottom))]`;
     BudgetTile over/left caption bumped `text-[10px]` → `text-xs`.
  2. New `src/components/BudgetSplitLines.tsx` (dual ItemBar rows, optional
     `extra` line) now renders the expanded breakdown in `BudgetTile`
     (app.index.tsx) and `SpendRow` (app.spending.tsx, `extra` = 3-mo avg).
  3. Paycheck Budget: sticky safe-area-aware "left to allocate" pill inside
     `PeriodBudget`, additive to the existing Card, same value/colour logic.
  4. Transactions: persistent description/place search input plus
     "Amount from"/"Amount to" range inputs in the filter panel; wired into
     the filter chain, `activeFilterCount`, and `clearFilters()`.
  5. New `src/components/HelpButton.tsx` (Popover + HelpCircle) placed on the
     Dashboard hero set-aside figure, Available credit row, Past due header,
     and the Paycheck "Projected" badge.
  6. Dashboard reorg: Payoff progress moved below "Still owed" and made
     collapsible (default closed); Past due split into a
     "Paycheck / HSA deduction" group (via `debts.is_paycheck_deduction`) and
     "Other", extracted as a shared `OverdueRow`. `overdueTotal` unchanged.
     No HSA-specific schema/logic added — still out of scope.
  7. Transfer mode: static helper text explaining transfers move money
     between the household's own accounts, so no Place is needed.
  8. `TransactionDetail` exported from app.transactions.tsx and mounted in
     app.accounts.tsx; Recent Activity rows are now clickable (`onSelect`).
  Known issues: none observed; typecheck clean, no schema changes.

- ADR-070 Payment Reversal Tool implemented (patterns from ADR-037 payable-first
  writes and ADR-046 fee/ledger pairing; no new ADR created).
  - `src/lib/payments.ts`: new `useReversePayment()` — rolls the payable back
    first via the existing `updateRow()` (`.select("id")` + throw on 0 rows) and
    only then inserts the offsetting cleared transaction, so a failed payable
    write can never leave an orphan reversal row. Bills:
    `cycle_paid_to_date = max(0, paid - abs(amount))`, `payment_status='unpaid'`
    when below `cycle_amount_due ?? amount`. Debts: same cycle rule plus
    `remaining_balance += abs(amount)` and `date_paid_off` cleared.
  - New `src/components/ReversePaymentButton.tsx`: Undo2 icon button beside the
    existing trash button, visible only for cleared, bill/debt-linked, negative
    rows; confirm dialog ("Reverse this payment? This will undo it as if it
    never cleared.") with a reversal-date field defaulting to today.
  - `src/routes/app.bills.tsx` / `src/routes/app.debts.tsx`: Recent transactions
    sections now take the full bill/debt row and render the reverse button.
  - No schema changes. Typecheck clean.
