# Features I want
- [x] [high] per-paycheck budgeting
- [x] [med] future budgeting
- [ ] [med] bill calendar (sync with Google calendar)
- [ ] [low] tracking for side income, like UberEats driving
- [x] [high] be able to handle partial payments and payment reversals
- [x] [med] bill/debt that is pending should not show 'Submitted' button
- [ ] [low] simple AI chatbot to help answer questions, generate summaries, guide user around the app, etc
- [ ] [low] sync with banks like Rocket or Tilt
- [ ] [high] ability to add fees/extras
- [x] [high] generate 1 page reports
- [ ] [low] colour themes customization
- [ ] [med] ability to add PDF/image receipts
- [ ] [med] ability to split transactions
- [ ] [med] ability to add invoices (treat as debts?)
- [ ] [high] ability to split paycheck to accounts | marking income as received adds transaction to appropriate account

# Views
- [x] bill detail
- [x] institutions - category icons / capitalization / group by / linked bills/debts
- [ ] account detail
- [ ] 



# Next Lovable prompt
## [ ] 1. Split Transactions
Implement ADR-044 (split transactions via transactions.split_group_id) from
DECISIONS.md — do not create a new ADR for this, the schema and decision are already
recorded.

Add split-transaction support to the quick "Add Transaction" flow (Phase 4.5) and any
transaction edit UI. Supabase schema already has transactions.split_group_id
(uuid, nullable).

1. Add Transaction: add a "Split into multiple categories" toggle. When on, replace
   the single category field with a repeatable list of {category, amount} rows. Show
   a running total vs. the entered total amount; block save unless they match exactly.
   On save, insert one transactions row per split line, all sharing the same new
   split_group_id (generate client-side), account_id, transaction_date, description,
   and status — only category_id and amount differ per row.

2. Anywhere transactions are listed (Accounts recent transactions, Transactions
   screen), group rows sharing a split_group_id visually (e.g. one card showing the
   total with an expandable breakdown of category lines) rather than as N separate
   flat rows.

3. Editing a split transaction: show all its lines together in the same split editor
   used for creation, pre-filled. Saving deletes all existing rows in that
   split_group_id and re-inserts fresh ones — don't try to diff/patch individual lines.

4. Split transactions never have linked_bill_id/linked_debt_id/linked_goal_id set —
   don't add the split toggle to bill/debt payment flows or the goal Add/Withdraw
   actions, only the standalone Add Transaction entry point.

No changes to balances.ts or spending-actuals.ts — both already sum transactions per
account/category/month and will handle split rows automatically.

## [ ] 2. Invoices + adjustments
Implement ADR-045 (invoices as debts + debt_adjustments table) from DECISIONS.md — do
not create a new ADR for this, the schema and decision are already recorded.

Add support for one-time invoice debts and balance adjustments. Supabase schema
already has the new debt_adjustments table (household_id, debt_id, amount,
adjustment_type, description, adjustment_date), RLS already applied.

1. Debt add/edit form: add "Invoice" as a selectable debt_type option alongside the
   existing Medical/Credit Card/Loan/Other/Advance values.

2. Debt detail view: add an "Adjustments" section below the existing recent
   transactions list, same card/list styling. Show adjustment_date, adjustment_type
   (title-cased label), description, and signed amount. Include a small add form/
   dialog with fields: amount, type (dropdown: Insurance Covered, Insurance Discount,
   Late Fee, NSF Fee, Other), description, date (defaults to today).

3. Saving a new adjustment: insert the debt_adjustments row, then update that debt's
   remaining_balance by adding the signed amount (negative amounts, like insurance
   coverage, reduce remaining_balance; positive amounts, like a late fee, increase
   it). Use the same payable-first-then-ledger write ordering as payments (ADR-037).

4. Each adjustment row gets a delete/undo action that reverses the balance change
   (remaining_balance minus that adjustment's amount) and removes the row — same
   repair-delete pattern already used for stranded/linked transactions (ADR-037),
   not a full confirm-dialog undo flow.

Adjustments never touch the transactions table or account balances — they only affect
the debt's own remaining_balance.

## [ ] 3. Payment fees
Implement ADR-046 (transaction fees on bill/debt payments) from DECISIONS.md — do not
create a new ADR for this, the decision is already recorded.

Add an optional transaction fee to the bill/debt payment flow (pay-flow.tsx). This
does NOT require a schema change — it uses two plain transactions rows, same pattern
as the existing envelope Set Aside action (ADR-038).

1. In the payment prompt (submit/clear, per ADR-035/036), add an optional "Fee"
   amount field below the payment amount, defaulting to blank/0.

2. On confirm, if fee > 0, write two transactions rows instead of one, both same
   account_id and transaction_date/status as today's single-row behavior:
   - Payment row: amount = the entered payment amount, linked_bill_id or
     linked_debt_id set as normal. This is the only row that feeds
     applyClearedPayment()'s cycle_paid_to_date / remaining_balance logic — unchanged.
   - Fee row: amount = the fee, no linked_bill_id/linked_debt_id set, category_id
     set to the household's "Fees" category if one exists (look up by name, don't
     hardcode an id), description "Fee: <bill/debt name>".

3. If fee is 0/blank, behavior is unchanged — write only the single payment row as
   today.

4. The bill/debt detail "Recent transactions" section should show both rows when a
   fee was included, so the fee is visible next to the payment it belongs to (they
   share date/account, so grouping by date+account visually is enough — no new
   linking field needed).

Don't change applyClearedPayment(), cycle math, or ledger-state.ts (ADR-036) — the
fee row is intentionally invisible to all of that since it has no linked_bill_id/
linked_debt_id.

## [ ] 4. Mark income received -> split transactions
Implement ADR-047 (mark income received auto-creates split transactions) from
DECISIONS.md — do not create a new ADR for this, the decision is already recorded.
This extends ADR-024, whose income_source_splits table already exists.

Add a "Mark as received" action to income_events, which auto-creates transactions
from that event's income_source's income_source_splits (ADR-024 schema, already
exists — income_source_splits has account_id, amount, day_offset per split, with
exactly one split acting as the remainder).

1. On the Paycheck Budget Income tab, add a "Mark as received" button/action per
   income_event that doesn't yet have an actual_date set. Prompt for actual_date
   (default: today) and actual_amount (default: the income_event's expected_amount,
   or the source's typical amount if that's null) — skip prompting for whichever of
   these the event already has set.

2. On confirm, look up income_source_splits where income_source_id matches this
   event's source:
   - If no split rows exist: prompt for a single destination account (same as
     today's unsplit flow) and create one cleared transaction for the full
     actual_amount, no category, no linked_bill/debt/goal id.
   - If split rows exist: create one cleared transaction per fixed (non-remainder)
     split — amount = the split's stored amount, account_id = the split's
     account_id, transaction_date = actual_date + that split's day_offset (days).
     Then create one more transaction for the remainder split: amount =
     actual_amount minus the sum of the fixed splits' amounts, account_id = the
     remainder split's account_id, transaction_date = actual_date + its day_offset.
     None of these get a category_id or any linked_bill_id/linked_debt_id/
     linked_goal_id. Description on each: "Paycheck: <source name> → <account name>".

3. If the computed remainder would be negative (actual_amount is less than the sum
   of fixed splits), don't auto-create anything — show a warning explaining the
   shortfall and let the user manually adjust the remainder amount (or the
   actual_amount) before confirming.

4. After marking received, set the income_event's actual_date/actual_amount as
   entered (if not already set), same as today.

Don't change income_source_splits editing (still not built, out of scope), Paycheck
Budget period math, obligationsInRange(), or pay_period_allocations — this only adds
what happens at the moment of marking an event received.

## [ ] 5. Institution form UX
This is a UI-only change, not tied to a new ADR — no schema changes, all fields
referenced below already exist (institution_categories from ADR-005, institution_type,
accounts.institution_id). Don't create an ADR for this.

Improve the Institution add/edit form's usability.

1. Category: replace the current category input with a multi-select dropdown listing
   existing categories (icon + name, from categories.icon/color per ADR-029), writing
   to institution_categories (ADR-005's join table) the same way it's written today —
   just change the input control, not the write logic.

2. Type: replace the free-text/current institution_type input with a dropdown of the
   existing allowed values (bank, credit_card, lendor_lessor, financial, tool,
   medical, utility, subscription, other), title-cased labels matching the display
   formatter already used elsewhere (institution list/detail).

3. Linked accounts: add a section to the Institution form (visible on both add and
   edit) listing that institution's accounts (accounts.institution_id = this
   institution), with an "+ Add account" action that opens the existing account
   add/edit form pre-filled with institution_id set. On the add-institution flow
   specifically (institution doesn't have an id yet), either save the institution
   first before allowing "+ Add account" to be tapped, or queue the account creation
   to run immediately after the institution saves — pick whichever fits the existing
   form's save flow with the least rework.

Don't change institution_categories' underlying data model or institutions' RLS.

## [ ] 6. Bill/Debt form inline "Add Institution"
This is a UI-only change, not tied to a new ADR — no schema or workflow change. Don't
create an ADR for this.

Add an inline "+ Add Institution" option to the Bill add/edit form's Institution
dropdown (the same dropdown used to set bills.institution_id).

1. Add a fixed option at the top or bottom of the Institution select, e.g.
   "+ Add new institution", separate from the real institution rows.

2. Selecting it opens the existing Institution add/edit form (as a dialog/sheet over
   the Bill form, not a full navigation away — don't lose the in-progress bill data).

3. On saving the new institution, close that dialog and auto-select the newly created
   institution in the Bill form's Institution field, so the user doesn't have to
   reopen the dropdown and find it.

4. Canceling the institution dialog returns to the Bill form with the Institution
   field unchanged (still unset or whatever it was before).

Apply the same "+ Add new institution" pattern to the Debt form's Institution
dropdown too, for consistency — same behavior, same dialog reused.


# Next Steps




# Daily Summary prompt
Read docs/SESSION.md, docs/CONTEXT.md, and docs/CHANGELOG.md.

1. Summarize the changes logged in SESSION.md into new dated entries appended to
   docs/CHANGELOG.md, following its existing format (## <date> – <short title>, then
   ### Completed / relevant subsections). Don't rewrite or reformat CHANGELOG's existing
   entries — only append new ones for what's in SESSION.md. If there are any entries left in ## Backlog section, be sure to add/update them in docs/TODO.md
2. Update docs/TODO.md entries with work done since last update.
3. Update docs/CONTEXT.md's "Current Status" phase list and any "Locked Decisions" /
   "Important Rules" sections that changed based on SESSION.md's content (e.g. new fields,
   new tables, new behavior). Keep CONTEXT.md's existing structure and brevity — it's meant
   to stay a compact briefing, not grow into a full changelog.

4. Once both files are updated, clear docs/SESSION.md back to an empty template (just a
   header, e.g. "## Session Notes" with no entries) so it's ready for the next work session.

Show me the diffs for all three files before finalizing.


# Things to work on
- When adding a new Institution, Categories should be a dropdown with the items and icons. Type should be a dropdown, and there should be an option to select/add linked accounts.
- When adding a new Bill, the dropdown for Institution should include an option for New or Add Institution, which opens the form for Add Institution.