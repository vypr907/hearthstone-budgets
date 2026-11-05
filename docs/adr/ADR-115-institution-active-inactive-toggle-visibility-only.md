## ADR-115: Institution Active/Inactive Toggle (Visibility-Only)

Decision:
New column `institutions.is_active boolean not null default true`.
Mirrors `bills.is_active`/`auto_transfers.is_active`'s UI pattern exactly
— `InstitutionDialog.tsx` gets the same `Switch` block `BillDialog` has,
seeded `institution?.is_active !== false`; the institution list's Card
rows get the same `opacity-60` + `· Inactive` dim treatment `BillRow`/
`DebtRow` already use in `app.institutions.tsx`; a new page-level
`Switch` next to the existing "Group by" control defaults to hiding
inactive institutions, with no existing show/hide-inactive toggle
anywhere else in the app to copy — this one is net-new UI.

Unlike `bills.is_active`, this toggle is **visibility-only**: an inactive
institution still counts toward every existing balance/total calculation
(`computeInstitutionTotals`, paycheck budgeting, spending actuals) exactly
as before. `balances.ts` and its callers are untouched.

Reason:
The user wants a way to retire an institution from the default Institutions
list (e.g. a closed account, a cancelled subscription's merchant) without
deleting it or losing its linked history. Unlike a bill going inactive —
which should stop pulling money toward budget calculations — an inactive
institution is just a dormant record; its past bills/debts/transactions
already carry their own independent `is_active`/paid-off state, so nothing
about the institution being "inactive" should silently change a dollar
total elsewhere. Scope confirmed with the user directly (visibility-only,
not the heavier "also exclude from totals" option).

Status: Decided 2026-11-05. Implemented 2026-11-05 — migration run by the
user and verified via MCP (column present, `boolean not null default
true`, all 172 existing institutions defaulted to active). `tsc --noEmit`
clean, 283/283 tests pass.

---

