## ADR-113: Personal Debts (institution_type='person') + "Paid by Someone Else"

Decision:
Two household friends fronted money: one covered part of a car repair bill
directly with the shop, the other paid the GVEA electric bill directly to
get it reconnected while the household was behind. Neither is representable
today — `institutions`/`debts` only model businesses, and a bill/debt paid
by someone else still needs to show as paid on the ledger even though no
money moved through any of the household's own accounts.

1. **`institution_type` gains a new value: `person`.** A friend/family
   member who fronts money becomes an ordinary `institutions` row with this
   type — reuses the Institutions screen, logo, notes, and `debts
   .institution_id` exactly as-is. No new table. Same drop/recreate-
   constraint migration pattern as ADR-099
   (`scripts/migrations/2026-10-23-institution-type-person.sql`); `"person"`
   added to `INSTITUTION_TYPES` (`InstitutionDialog.tsx`) and to
   `INSTITUTION_TYPE_META` (`visual-meta.ts`, 👤 icon). No institution-field
   gating added (login_url/sign_in_with_google render the same for every
   type today — a person-specific exception would be a new, inconsistent
   precedent).

2. **A personal debt is just an ordinary debt.** The car-repair IOU is
   `institution_id` = the friend's person-institution, `debt_type = 'loan'`
   — no new debt_type. It participates in the payoff engine (Snowball/
   Avalanche, payoff-date projections) exactly like any other loan; only
   `debt_type === 'advance'` is excluded there, and a personal loan isn't
   one — it's a fixed amount meant to be paid off, not a revolving balance.

3. **"Someone else paid this" generalizes the ADR-056 advance mechanic.**
   New hook `useLogPaymentCoveredByOther` (`data-hooks.ts`), called by both
   `LogBillPaymentDialog.tsx` and `LogDebtPaymentDialog.tsx` right after
   their normal payment mutation succeeds (that mutation — the real -X
   payment transaction — is unchanged). It writes:
   - A `+X` wash transaction on the SAME account/date as the real payment,
     `linked_debt_id` = the covering person-debt, description
     `"Covered: <name>"`, with its OWN fresh `transfer_group_id` (never the
     same group as the -X leg — `internalTransferIds()` treats a shared-
     group negative+positive pair as a two-sided internal transfer and
     excludes both legs from spend, which would make the real expense
     vanish from spending-by-category instead of showing as spend offset by
     a debt increase).
   - An `apply_debt_adjustment` RPC call (`p_amount = +X`) and a paired
     `debt_adjustments` row (`adjustment_type = 'covered_payment'`,
     `mirror_transaction_id` = the wash transaction's id) on the covering
     debt — reuses `useDeleteDebtAdjustment`'s existing unconditional
     mirror-transaction cleanup for free: deleting this adjustment later
     also deletes the wash leg, no new delete code needed.

   New predicate `isCoveredPaymentDisbursement` (`payments.ts`), identified
   by the positive amount + `"covered:"` description prefix, mirrors
   `isAdvanceDisbursement`. Both are combined into `isDebtDisbursement`,
   which replaces every `isAdvanceDisbursement` exclusion check in cycle/
   history math (`ledger-state.ts`'s `deriveCycleInfo`, `debt-history.ts`,
   `debt-episodes.ts`, plus the Debts-screen Recent Transactions label and
   the Debt Strategy screen's paid-by-debt totals in `app.debts.tsx`/
   `app.debt-strategy.tsx`) — required, not optional: without it the wash
   leg's positive amount would be read as a *negative* contribution (a
   refund) toward the covering debt's own cycle math, corrupting it.

   The picker in both dialogs only offers existing debts whose institution
   is `institution_type = 'person'` (keeps the feature's meaning
   unambiguous) and does not yet support inline "+ New debt" quick-create
   from inside the payment dialog — ship the core mechanic first; create a
   person + debt on the Institutions/Debts screens first, then use the
   picker. (A chained InstitutionDialog→DebtDialog quick-create was
   considered but would need `DebtDialog`, which lives in the
   `app.debts.tsx` route, imported into a shared component — a circular-
   import risk not worth taking for a v1 UI convenience.)

Reason:
Reusing `institutions`/`debts` for people (rather than a parallel "lenders"
system) means every existing debt feature — payoff ordering, balance
history, the Debts screen, Institutions grouping — works for a personal IOU
with zero additional code. Reusing the ADR-056 advance mechanic for "paid by
someone else" means the hard part (atomic balance update via
`apply_debt_adjustment`, mirror-transaction cleanup, disbursement-exclusion
from cycle math) was already solved and tested; the only genuinely new
concept is the `transfer_group_id`-must-NOT-be-shared rule, which keeps the
real expense visible in spending while still netting the real account's
balance to zero (no money actually moved through it).

Status: Decided 2026-10-23. Implemented 2026-10-23 — `tsc --noEmit` clean,
277/277 tests pass (3 new, covering `isCoveredPaymentDisbursement`/
`isDebtDisbursement`). Migration not yet run by the user (
`scripts/migrations/2026-10-23-institution-type-person.sql` — Supabase SQL
Editor, per this project's hard rule). Not yet checked in a running browser.

```sql
-- scripts/migrations/2026-10-23-institution-type-person.sql
begin;
alter table public.institutions drop constraint institutions_institution_type_check;
alter table public.institutions add constraint institutions_institution_type_check
  check (institution_type = any (array[
    'bank', 'credit_card', 'lendor_lessor', 'financial', 'tool', 'medical',
    'utility', 'subscription',
    'restaurant', 'grocery_store', 'gas_station', 'liquor_store',
    'department_store', 'specialty_store', 'venue', 'game', 'app',
    'dispensary', 'personal_care', 'employer', 'delivery',
    'person',
    'other'
  ]::text[]));
commit;
```

