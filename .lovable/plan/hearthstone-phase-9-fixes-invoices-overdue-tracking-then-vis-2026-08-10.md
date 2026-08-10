# Hearthstone — Phase 9: Fixes, Invoices & Overdue Tracking (then Visual Pass)

Two phases. Phase 1 is correctness: the four bugs, the invoice/payment-plan model, overdue-amount tracking, and income backfill. Phase 2 is the visual/UX list.

## Phase 1 — Fixes and new capability

### 1. Invoice crash: `starting_balance` violates not-null
The debt save in `src/routes/app.debts.tsx` never sends `starting_balance`, so the database receives null and rejects the row.

Fix: on create, default `starting_balance` to the entered remaining balance (or the invoice total) when the field is left blank, and add an explicit "Original / invoice amount" input to the debt form. No schema change needed.

### 2. Invoice due dates and payment plans
- Debt form: when `debt_type` is `invoice`, replace the "due day" number with a real date picker writing `next_due_date`.
- Billing cycle gains a `one_time` option (non-recurring). One-time debts never roll a cycle; once cleared they are paid off.
- New "On a payment plan" toggle available at Add. When on, capture:
  - payment amount (writes `minimum_payment`)
  - number of payments (optional)
  - final payment amount (optional, when different)
  - plan cycle (monthly / biweekly / custom, reusing the existing cycle controls)
- Detail view shows plan progress: payments made / total, projected payoff date.
- Payment-plan fields need a small schema addition on `debts`: `plan_payment_count`, `plan_final_payment`, plus reuse of existing `on_payment_plan`. Because this project uses your own Supabase, the plan ships the SQL for you to run; the UI degrades gracefully until it is applied.

### 3. Overdue amount tracking
Today the app only knows something *is* overdue. Add "by how much".

- New helper `src/lib/arrears.ts`: walk cycles backwards from today to the item's cycle anchor, sum each missed cycle's unpaid amount, and return `{ cyclesMissed, amountOverdue, oldestMissedDate }`.
- Because the app does not hold full history, each bill and debt gets a manual **opening arrears** value (amount already past due before tracking started) plus a "settled as of" date. Total overdue = opening arrears + computed missed cycles after that date.
- Surfaces: overdue badge on Bills/Debts rows ("2 cycles · $420 past due"), a Dashboard "Past due" card, and the Payment Schedule.
- Schema addition on `bills` and `debts`: `opening_arrears`, `arrears_as_of`.

### 4. Stranded debt payments card won't clear
`findStrandedDebtPayments` flags a debt whenever its cycle looks unresolved **and** `cycle_paid_to_date` is 0 — so a debt fixed by adjusting the balance directly (rather than by crediting the cycle) still trips the check.

Fix: tighten the check to ignore debts whose cycle has advanced past the cleared rows' dates, and add a per-debt "Already fixed / ignore" dismissal that persists, instead of the current dismiss-everything-until-reload button.

### 5. Backfill transactions for older income events
Add a "Post deposits" action on already-received income events that runs the same ADR-047 split logic retroactively, skipping any deposit rows that already exist so it can't double-post.

### 6. Institution categories picker
`InstitutionDialog` renders categories as a wrap of toggle buttons. Replace with a proper multi-select dropdown (checkbox list in a popover) showing icon + colour, with selected categories as chips beneath.

## Phase 2 — Visual and UX pass

- **Bills/Debts icons**: use the linked institution's logo first, emoji only as fallback.
- **Accounts & Balances**: show the institution logo instead of its name text.
- **Dashboard Budget vs Actual**: replace the text-heavy rows with compact bars/donuts per category, numbers on tap.
- **Spending screen**: mobile-first rework — chart-led summary, condensed category rows, less prose.
- **More screen**: icon grid/gallery instead of a stacked list.
- **Add Transaction category picker**: larger visual rows showing icon + coloured name (icon · name) rather than the current "parent · name" text.
- **Merchant capture on Add Transaction**: an inline "new place?" suggestion that creates an institution from the typed description without leaving the form, auto-filling the logo from a favicon lookup on a guessed domain. Groundwork for a future "spending by institution" screen.

## Technical notes

- SQL for the new columns (`debts.plan_payment_count`, `debts.plan_final_payment`, `bills/debts.opening_arrears`, `bills/debts.arrears_as_of`) is provided for you to run in your own Supabase project, followed by a PostgREST schema reload.
- Arrears logic lives in a new pure module with unit tests, reusing `deriveCycleInfo` and the ADR-040 custom-cycle date maths.
- New ADRs: invoice/payment-plan modelling, and arrears tracking with a manual opening balance.
- Docs updated per project rules: SESSION.md, SCHEMA.md, DECISIONS.md, TODO.md.
