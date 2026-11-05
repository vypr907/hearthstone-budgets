## ADR-082: Explicit Deduction Kind; Three-Way Past Due Grouping

Decision:
Add `income_source_deductions.kind text not null default 'payroll'`, CHECK-constrained
to ('payroll','hsa','fsa','other'). This becomes the single source of truth for
classifying a deduction, replacing the `fundingLabel()` heuristic in `app.index.tsx`
that regex-matches /hsa|fsa/ against the destination account's name/type.

The Dashboard "Past due" section's grouping changes from binary
(`debts.is_paycheck_deduction` only, debts only) to three-way:
- Payroll deduction — items funded by a kind='payroll' deduction, plus legacy
  `debts.is_paycheck_deduction=true` debts with no `funding_deduction_id`.
- HSA / FSA — items funded by a kind IN ('hsa','fsa') deduction.
- Other — ordinary bills/debts.

An overdue item counts as deduction-funded if it has a `funding_deduction_id` (bill OR
debt — ADR-068 already gave bills this column, so deduction-funded bills now group
correctly instead of falling into "Other"), or, for debts only, the legacy
`is_paycheck_deduction` flag. Classification lives in a pure helper in
`src/lib/deduction-funding.ts`; the Dashboard is this ADR's only consumer.

`debts.is_paycheck_deduction` is unchanged in meaning and keeps its ADR-032 role
(exclude the debt from obligation/budget math). `kind` is purely additive — a debt may
carry both. The income-source detail deduction dialog gains a "Kind" picker
(Payroll / HSA / FSA / Other), defaulting to Payroll.

Migration backfills `kind` from the existing heuristic one final time (hsa where the
destination account name/type matches /hsa/i, fsa where /fsa/i, else payroll); after
that the column is authoritative and the heuristic is deleted.

Schema:
    alter table income_source_deductions
      add column if not exists kind text not null default 'payroll';
    alter table income_source_deductions
      add constraint income_source_deductions_kind_check
      check (kind in ('payroll','hsa','fsa','other'));

    update income_source_deductions d
    set kind = case
      when a.account_type ilike '%hsa%' or a.name ilike '%hsa%' then 'hsa'
      when a.account_type ilike '%fsa%' or a.name ilike '%fsa%' then 'fsa'
      else 'payroll'
    end
    from accounts a
    where d.destination_account_id = a.id;

    notify pgrst, 'reload schema';

Reason:
The row-level "HSA-funded" vs "Deduction-funded" label (ADR-068) already exists, but
it's derived by regex on an account name — fragile, and invisible to the Past Due
grouping, which still keys off `debts.is_paycheck_deduction` alone. That flag doesn't
exist on bills, so a deduction-funded bill (ADR-068) that goes past due shows up mixed
into "Other" instead of with the other automatically-handled items. An explicit `kind`
column fixes both the fragility and the bill/debt asymmetry, and gives a real 3-way
split without overloading `is_paycheck_deduction` (which has a separate, load-bearing
budgeting-exclusion job).

Status: Decided 2026-08-26. SQL migration run and verified live via the read-only MCP
(column `kind text not null default 'payroll'`, CHECK against the 4 values; backfill
put HSA → hsa, LPFSA → fsa, the other 22 → payroll). Implemented 2026-08-26:
- `DeductionKind` type + `IncomeSourceDeduction.kind` (`src/lib/supabase.ts`).
- `pastDueGroup()` + `deductionFundingLabel()` pure helpers in
  `src/lib/deduction-funding.ts` (11 unit tests).
- "Kind" picker on the income-source deduction dialog
  (`src/routes/app.income-source.$id.tsx`); `useUpsertIncomeSourceDeduction` passes it
  straight through.
- Dashboard "Past due" (`src/routes/app.index.tsx`) is now three-way: one collapsible
  "Auto-handled off paycheck" section with "Paycheck deduction" and "HSA / FSA"
  sub-lists, plus the ordinary "Other" list. The old `fundingLabel()` regex is deleted.

UI note: the two deduction groups share one collapse toggle (both are "no action
needed" awareness items) rather than collapsing independently — the classification is
three-way, the display keeps the dashboard compact.

