## Session Notes

- ADR-081 (Auto-Transfer tracking): drafted and appended to docs/DECISIONS.md.
  Schema migration (new `auto_transfers` table + `transactions.linked_auto_transfer_id`
  column + `set_auto_transfers_updated_at` trigger) run by the user in the Supabase
  SQL Editor and confirmed live via the read-only MCP (`list_tables`/`execute_sql`).
- ADR-081 data layer landed: `src/lib/auto-transfers.ts` (new) — `deriveAutoTransferState`
  (stripped-down `deriveCycleInfo` for the 2-state unpaid/cleared case, no
  partial/pending), `useProcessAutoTransfer`/`useUndoAutoTransferProcess` (writes/undoes
  an ADR-056 transfer pair, credit leg tagged `linked_auto_transfer_id`), `isAutoTransferOverdue`.
  `src/lib/data-hooks.ts`: `useAutoTransfers`/`useUpsertAutoTransfer`/`useDeleteAutoTransfer`
  CRUD hooks, mirroring the existing bill hooks. `src/lib/supabase.ts`: new `AutoTransfer`
  type, `transactions.linked_auto_transfer_id` field. `src/lib/visual-meta.ts`: new
  `AUTO_TRANSFER_ICON` constant ("🔁").
  - Deliberately did NOT extend the existing `Payable`/`PayableKind`/`deriveCycleInfo`
    machinery in `payments.ts`/`ledger-state.ts` — that code is deeply bill/debt-specific
    (ternaries throughout for arrears/partial/pending/fees logic that doesn't apply to
    auto-transfers), so a parallel, much simpler dedicated module was the smaller and
    safer change. This is a deliberate deviation from ADR-081's original draft wording,
    which assumed a straight 3-way `PayableKind` extension — the ADR's decision text
    still holds at the design level (reuse the ledger-state *pattern*), just implemented
    as a sibling module instead of inline extension.
- ADR-081 obligations engine: `src/lib/paycheck-budget.ts` — `Obligation.kind` gained
  `"auto_transfer"`; `obligationsInRange()` gained an `autoTransfers` parameter (new 3rd
  positional arg) and a loop reusing `isDueOrOverdueInPeriod`/`projectOccurrences`
  unchanged, so auto-transfers inherit ADR-080's "stays due every period until
  processed" behavior. `src/lib/snapshot.ts`'s lone other call site passes `[]` — that
  screen doesn't surface auto-transfers, unchanged behavior.
- ADR-081 Bills screen UI: `src/routes/app.bills.tsx` — new "🔁 Auto-Transfers" section
  below the Bills list, `AutoTransferRow` (two-state Process/Undo button, no amount
  prompt, "Check on this" amber badge instead of red past-due money when overdue) and
  `AutoTransferDialog` (add/edit, mirrors `BillDialog` trimmed to what applies).
- ADR-081 Paycheck Budget: `src/routes/app.paycheck.tsx` — fetches auto-transfers,
  threads them through `obligationsInRange`, extends the category/account grouping maps
  and the ledger-state status map (auto-transfer branch calls `deriveAutoTransferState`
  instead of `deriveCycleInfo`), and tags auto-transfer rows "🔁 Auto-transfer" in the
  existing kind-label subline convention.
- ADR-081 Dashboard: `src/routes/app.index.tsx` — hero card gained a third
  "🔁 this {period}" tile (3-column grid, was 2), and a new standalone "Auto-Transfers"
  card (own section, not folded into Bills/Debts "Still owed"/"Past due" language) lists
  unprocessed auto-transfers with a 3-day "due soon" highlight and a soft amber
  "Check on this" flag when overdue — deliberately not the red arrears styling, since
  nothing is actually owed to a vendor.
- Docs: docs/SCHEMA.md gained `auto_transfers` and
  `transactions.linked_auto_transfer_id` sections; docs/SCRATCHPAD.md's "recurring
  transfers with a due-date reminder" item removed (now scoped/implemented as ADR-081).

### Known issues / not yet done
- Cannot build-verify locally (Windows AppLocker blocks `vite`/`tsc` per CLAUDE.md).
  Code has been read through carefully but not compiled or run in a browser — ask the
  user to build/deploy and smoke-test the Bills screen section, Paycheck Budget, and
  Dashboard card before considering ADR-081 fully implemented.
- Not yet end-to-end verified: the Supabase MCP is read-only, so no test data could
  be written from this side to trace the process/undo flow. Needs the user to add a
  real auto-transfer in the app, hit "Process transfer," and confirm the transaction
  pair, `next_due_date` advance, and Paycheck Budget/Dashboard totals are correct.
