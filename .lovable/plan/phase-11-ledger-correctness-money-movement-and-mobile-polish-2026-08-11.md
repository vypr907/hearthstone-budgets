# Phase 11 — Ledger correctness, money movement, and mobile polish

Closes the open TODO items plus the issues you listed. Grouped so each group can land and be tested on its own.

## 1. Bug fixes (do first)

- **Pay dialog is unclickable.** Any tap on the "How much are you paying now?" sheet falls through to the row behind it and opens the bill detail. Stop the click/pointer events at the dialog and at the row-level tap handlers so only Tab is no longer required.
- **New place errors on Add Transaction.** Creating an institution inline fails while picking an existing one works — the insert is missing the household scope and/or required type/category fields expected by the table. Fix the insert payload and surface the real error message instead of a silent failure.
- **Fee not cleared with its payment.** A fee row is written alongside a pending payment but is never advanced when the payment clears. Clear (and reverse) the fee row together with the payment it belongs to, matched by the payment's group.
- **Stranded debt card false positive.** Still flags a debt you already repaired. Treat a debt as healthy when its balance reconciles with the sum of cleared linked payments within a small tolerance, and make dismissal stick permanently per debt.
- **Overdue not reduced by payment.** Paying an overdue bill leaves the past-due figure unchanged. See group 4.

## 2. Income: deductions, splits, auto-post

- New `income_source_deductions` (name, amount or percent, optional destination account, pre-tax flag). The amount on a source stays **net**; gross is shown as net + deductions.
- Marking a pay date received posts the net splits **and** a deposit transaction into each deduction's destination account (HSA, LPFSA, retirement). Deductions with no account are recorded for reporting only.
- The income source detail view gets a Deductions section next to Splits, and the stats line shows gross vs net.
- New pay dates post their deposits **automatically** on save; the manual "Post deposit" button stays for backfilling old dates.

## 3. Transfers and advances

- Add a Transfer mode to Add Transaction: pick from-account and to-account, one amount, two linked rows sharing a `transfer_group_id`.
- **Advance:** choose a debt (e.g. MoneyLion) and a destination account. Writes a deposit into the account and a linked debt-increase row; the debt's remaining balance goes up by the advance.
- Repayments already flow through the pay flow; they will now show as paired rows (money out of the paying account, balance down on the debt).
- Deleting either side of a transfer/advance removes both.

## 4. Overdue-aware payments

- The pay dialog offers three presets: **Owed this cycle**, **Total due (incl. past due)**, and **Other amount**, with the amount pre-filled per choice.
- Payments apply **oldest first**: current cycle is covered, then any overflow pays down missed cycles and carried-in `opening_arrears`, and the past-due badge drops accordingly.
- Arrears math accounts for payments already applied so an overdue bill stops re-counting a cycle you have paid.

## 5. Fees and adjustments on bills

- Bill detail gets the Adjustments section debts already have, and both gain an **Affects balance** toggle per entry: a late fee raises what is owed; a processing fee is a cash cost only.
- Existing debt adjustments keep their behaviour (they affect balance by default).

## 6. Spending screen — more graphical, less text

- Category rows become compact bars with icon, colour, spent/budget and a progress fill; the numbers move onto the bar instead of separate text lines.
- A donut or stacked share of spending by category at the top, month navigator unchanged, and a card linking to Spending by place.

## 7. Filtering, grouping, and drill-down

- Transactions screen: sort (date, amount, name), group (day, category, account, place), and filters (date range, category, account, place, status, linked/unlinked).
- Dashboard and Spending cards become tappable and open the Transactions screen pre-filtered to that category or budget item.
- Adds the open TODO item: re-tag an existing transaction with a place from the Transactions screen.

## 8. Remaining TODO items

- Share the Institutions and Accounts detail dialogs (only the add/edit forms are shared today).
- Re-verify the cleaned-up debt payments end to end after the stranded-detection fix.

## Technical notes

- Schema is self-managed Supabase, so all DDL ships as copy-paste SQL in `docs/SCHEMA.md`; the app degrades gracefully (new fields dropped from the payload) until it is applied.
- New: `income_source_deductions` table; `transactions.transfer_group_id uuid`; `transactions.affects_balance boolean default false` for fee/adjustment rows; `debts.advance` handled through existing columns. All new tables get `household_id`, grants for `authenticated`/`service_role`, RLS enabled, and an `is_household_member(household_id)` policy.
- Fee/payment pairing reuses the existing `split_group_id` so clearing, reversing, and deleting stay atomic.
- Arrears allocation lives in `src/lib/arrears.ts` with unit tests alongside the existing ones.
- Docs updated per project rules: `SESSION.md`, `SCHEMA.md`, `ARCHITECTURE.md`, `DECISIONS.md` (new ADRs for deductions, transfers/advances, overdue allocation, balance-affecting fees), `ROADMAP.md`. `TODO.md` is kept as an open-items list only — close completed items and remove any historical/completed entries so it shows only what is still outstanding.
