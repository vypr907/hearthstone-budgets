## Session Notes
- [x] ADR-044 split transactions: `split_group_id` on Transaction type, save/delete
      split hooks, `SplitLinesEditor`, split toggle in Add Transaction, grouped
      display (Transactions screen + Accounts recent activity), whole-group edit
      dialog (delete + re-insert on save).
- [x] ADR-045 invoices + adjustments: `debt_type` is now a dropdown including
      Invoice, Institution dropdown added to the Debt form, and an Adjustments
      section on debt detail (add dialog + per-row delete, payable-first balance
      write ordering).
- [x] Shared `InstitutionDialog` component (type dropdown, category multi-select,
      linked-accounts list) reused inline by the Debt form's
      "+ Add new institution" option.

- [x] ADR-046 payment fees: optional Fee field in the pay prompt; writes a second,
      unlinked transaction ("Fee: <name>") on the same account using the household
      "Fees" category when one exists. Never credits the cycle.
- [x] ADR-046 follow-up: `insertFeeTransaction` now auto-creates a "Fees" category
      when none exists, so fee rows are always categorised.
- [x] ADR-047 mark income received: "Mark received" button on each pay date writes
      the source's deposit splits (fixed rows + remainder absorbing variance,
      day_offset applied) as cleared transactions grouped by `split_group_id`.
- [x] ADR-047 follow-up: when an income source has no usable deposit splits, the
      Paycheck screen opens an account + amount picker dialog instead of silently
      marking received with no ledger entry. `useMarkIncomeReceived` accepts an
      optional `accountId` and writes a single deposit in that case.
- [x] Visual consistency pass: shared `SectionLabel` and `EmptyState` components;
      applied to Bills, Debts, Accounts, Goals, Everything, Transactions screens.
      Dashboard hero `bg-white/*` overlays replaced with theme-aware
      `bg-brand-foreground/*` opacity tokens (fixes dark-mode legibility).
- [x] Shared `AccountDialog` component (now with an Institution picker); the
      Institution form gained an inline "+ Add account" action.
- [x] Bill form: "+ Add new institution" option, matching the Debt form.
- [x] app.institutions.tsx now uses the shared `InstitutionDialog`.

### Known issues
- Institutions and Accounts screens still define their own detail dialogs; only the
  add/edit forms are shared.

## 2026-08-11 — Phase 9 part 1 (correctness)

- ADR-048 invoices: `one_time` billing cycle (never rolls, real due date),
  invoice type defaults to it, explicit "Original invoice amount" field feeding
  `starting_balance` (fixes the `null value in column "starting_balance"` crash),
  and an "On a payment plan" block with number of payments / final payment.
- ADR-049 arrears: new `src/lib/arrears.ts` (+ unit tests) sums missed cycles and
  manual carry-in; "Past due carried in" fields on Bill and Debt forms; new
  `PastDueBadge` on Bills/Debts rows; Dashboard "Overdue" is now "Past due" with
  a total and per-item cycles-behind count.
- Stranded debt repair no longer flags a debt that was fixed by hand (it now also
  requires the debt to be untouched since the ledger rows were written), and
  "Hide for now" is remembered per debt across reloads.
- Paycheck: received pay dates with no deposit rows get a "Post deposits" action
  that backfills the ledger through the same idempotent flow.
- Institution form: Categories is now a dropdown multi-select instead of a row of
  icon buttons.
- Bill/Debt saves drop columns the database doesn't have yet instead of failing,
  so the app works before and after the ADR-048/049 migration is applied.

### Known issues
- The ADR-048/049 migration in docs/SCHEMA.md must be run in Supabase; until then
  payment-plan and arrears fields silently don't persist.
- Institutions and Accounts screens still define their own detail dialogs.

## 2026-08-11 — Phase 9 part 2 (visual/UX)

- New `ObligationIcon` (+ `useInstitutionIndex`): Bills, Debts and Accounts rows
  now show the linked institution's logo first, falling back to institution type
  then a name-derived emoji. Accounts rows drop the institution name text.
- Dashboard "Budget vs actual" is now a headline spent/budgeted bar plus a
  two-column grid of ring tiles; the spending-vs-bills split moves behind a tap.
- Spending screen: chart-led month summary card (total spent, bar, spending /
  bills / 3-mo-avg tiles) replaces the table header and grand-total row; each
  category is a condensed ring row that expands for the split and edit buttons.
- More screen is a 3-up icon gallery instead of a stacked list.
- Add Transaction: category dropdown shows coloured icon + name rows, and typing
  an unknown place offers an inline "save as an institution" action that guesses
  a favicon from the merchant name (`guessMerchantDomain`).

### Known issues
- The ADR-048/049 migration in docs/SCHEMA.md must still be run in Supabase.
- Merchant capture creates the institution only; transactions still have no
  `institution_id` link.

## 2026-08-12 — Phase 10 part 1 (arrears editing, invoices, merchants)

- Past due editor (ADR-049) is now reachable from both Bill and Debt detail
  views, so arrears can be added or corrected on existing items.
- Debts: new Invoice number field; invoice names auto-compose as
  "<Institution> - <Invoice number>" until the name is typed by hand (ADR-052).
  Invoice number shows on the debt detail view.
- Stranded debt repair no longer re-flags debts whose balance already reflects
  every cleared payment (ADR-051).
- Add Transaction: typing a description suggests known places as one-tap chips
  and links `transactions.institution_id`; unknown places are still saved inline
  with a guessed favicon and linked immediately (ADR-053).

### Known issues
- The ADR-048/049 and Phase 10 (ADR-052/053) migrations in docs/SCHEMA.md must
  be run in Supabase; until then invoice numbers and transaction places don't
  persist.
- "Spending by place" view and the income-source detail route are still to come.

## 2026-08-12 — Phase 10 part 2 (spending by place, income source detail)

- Phase 10 migration confirmed run in Supabase: `debts.invoice_number` and
  `transactions.institution_id` now persist.
- New "Spending by place" screen (`/app/spending-by-place`, ADR-053): monthly
  merchant ranking with logo, bar, dollar amount, and share of total, plus an
  untagged-spending footnote. Linked from Spending and the More grid.
- New income source detail route (`/app/income-source/$id`, ADR-054): YTD /
  all-time / monthly-average stats, next expected paycheck, pay-date history,
  Edit source form, and a full deposit-splits editor (add/edit/delete, fixed or
  remainder, per account, optional day offset).
- Paycheck Budget: income sources render as tappable cards with cadence,
  received count, typical amount, and this-year total.
- `useUpsertIncomeSourceSplit` / `useDeleteIncomeSourceSplit` added to
  `src/lib/income-hooks.ts`.

### Known issues
- Spending by place only counts transactions that have a place attached; older
  entries need re-tagging by hand.
