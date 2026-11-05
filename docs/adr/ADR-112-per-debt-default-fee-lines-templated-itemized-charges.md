## ADR-112: Per-Debt Default Fee Lines (Templated Itemized Charges)

Decision:
`debts` gains one new nullable column: `default_fee_lines jsonb` — an array of
`{type, amount, note}` objects, the same shape as a `PaymentLine` (ADR-046
addendum/ADR-084). Both "Submit Payment" (`pay-flow.tsx`) and "Log a Payment
to this debt" (`LogDebtPaymentDialog.tsx`) pre-fill their fee/interest lines
from this column when opened for a debt that has one set, converting each
into an editable draft line (`draftsFromDefaultLines`, `payments.ts`) — the
household then only verifies/adjusts amounts instead of re-adding every line
each time. A "Save as default" action next to each dialog's "Add
line"/"Add charge" button snapshots the dialog's *current* lines onto the
debt (`useSaveDefaultFeeLines`, `payments.ts`) — overwriting the previous
default, or clearing it (writing `null`) when saved with no charged lines.

This is a deliberate household-set snapshot, not derived from the most recent
payment's transaction description — reconstructing lines by parsing a past
`"Fee: <name> · <type> — <note>"` string back apart would be fragile (the
whole point of ADR-046/084's description-prefix convention is write-time
composition, not read-time parsing) and would conflate "what happened last
time" with "what we expect every time," which drift apart in practice (e.g. a
rent-to-own payment's non-renewal fee or tax doesn't necessarily land on
every cycle).

Scoped to debts only (not bills) per the request that prompted this — a bill
equivalent (`LogBillPaymentDialog.tsx`) can reuse the same mechanism later if
wanted, with its own `bills.default_fee_lines` column.

Reason:
Some debts (e.g. a rent-to-own lease) charge the same itemized set of fees
on every payment. Without a template, every payment meant manually re-typing
each line's type/amount/note. Storing the household's own confirmed default
on the debt row needs no new table (jsonb column, not a join) and reuses the
existing `PaymentLine` shape end to end, so pre-fill/save-as-default is a
thin layer over code that already existed for this session's earlier
addendum.

Status: Decided 2026-10-16. Implemented 2026-10-16 — migration run by the user
in the Supabase SQL Editor and confirmed live (`default_fee_lines jsonb` on
`debts`, read back via the read-only MCP). Application code (`src/lib/
supabase.ts`, `src/lib/payments.ts`, `src/lib/pay-flow.tsx`, `src/components/
LogDebtPaymentDialog.tsx`) was already in place — `tsc --noEmit` clean,
274/274 tests pass. Not yet checked in a running browser.

```sql
alter table public.debts
  add column default_fee_lines jsonb;
```

