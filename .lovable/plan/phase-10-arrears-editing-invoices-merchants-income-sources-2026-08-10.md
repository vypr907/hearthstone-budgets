# Phase 10 — Arrears editing, invoices, merchants, income sources

## 1. Correct past-due amounts on existing bills and debts

A dedicated "Past due" editor, opened from the bill/debt detail view:

- Shows the computed breakdown: carry-in arrears + each missed cycle + total.
- Two editable controls: **Opening arrears** (money already past due before tracking started) and **As of date** (cycles on or before it are ignored).
- Saving re-runs the existing arrears calculation, so missed cycles keep counting automatically.
- Available for bills as well as debts (today only the debt form exposes these fields).

## 2. Invoice number and auto-named invoices

- New `invoice_number` field on debts, shown in the debt form only when type is Invoice.
- While adding an invoice, the name auto-composes as `Institution - INV-1234` when institution or number changes, and stops auto-filling as soon as the name is edited by hand. Existing invoices are never renamed behind your back.
- Invoice number shown on the debt detail view.

## 3. Stranded debt payments card

Tighten detection so a debt you already repaired stops being flagged: treat a cycle as healthy when the debt's balance or cycle credit moved after the ledger rows were written, or when the cleared total is already reflected in the balance. Manual dismissal stays as a fallback.

## 4. Merchants on transactions + Spending by place

- Transactions gain an institution (merchant/store) link.
- In Add Transaction, the description field becomes an autocomplete over existing institutions. No match shows a one-tap "Save Bob's Burgers as a new place" chip that creates the institution with a guessed logo and links it to the transaction — no extra screen, same speed.
- New **Spending by place** view: horizontal colored bars ranked by amount, each with logo, name, dollar total and percent — the layout in your screenshot. Month-scoped with the same month navigator as Spending.

## 5. Spending screen: more graphical

Continue the mobile pass — larger donut/bar visuals, fewer numeric columns, tap-to-expand detail rows, and a link across to Spending by place.

## 6. Income sources as cards with detail view

- Paycheck screen lists sources as cards: name, next expected pay date, amount, split count.
- New route `/app/income-source/$id` with:
  - Totals: all-time income, this year, average monthly.
  - Pay date history (expected vs actual, received state).
  - Edit source.
  - Full splits editor: ordered rows targeting any household account (checking, savings, retirement, HSA, LPFSA), each fixed-amount or remainder, with optional day offset.
- Marking received — and "Post deposits" for past pay dates — writes one cleared transaction per split into its account, as it does now, keyed by the income event so it can never double-post.

## Technical notes

Schema changes (you run these on your Supabase project; SQL will be added to `docs/SCHEMA.md`):

```sql
alter table public.bills  add column if not exists opening_arrears numeric default 0;
alter table public.bills  add column if not exists arrears_as_of date;
alter table public.debts  add column if not exists invoice_number text;
alter table public.transactions add column if not exists institution_id uuid references public.institutions(id) on delete set null;
create index if not exists transactions_institution_idx on public.transactions(institution_id);
```

Code touchpoints: `src/lib/arrears.ts` (unchanged math, new editor UI), `src/components/PastDueEditor.tsx` (new), `src/routes/app.bills.tsx`, `src/routes/app.debts.tsx`, `src/components/StrandedDebtRepair.tsx`, `src/components/AddTransactionFab.tsx`, `src/lib/visual-meta.ts` (logo guess), `src/routes/app.spending.tsx`, `src/routes/app.spending-places.tsx` (new), `src/routes/app.paycheck.tsx`, `src/routes/app.income-source.$id.tsx` (new), `src/lib/income-hooks.ts`, `src/lib/supabase.ts`.

Docs updated per project rules: SESSION, SCHEMA, ARCHITECTURE, DECISIONS (ADR-051 arrears editing, ADR-052 invoice numbering, ADR-053 transaction merchants, ADR-054 income source detail), TODO, ROADMAP.
