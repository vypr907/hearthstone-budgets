# SESSION.md

## Session Notes

- **Issue #58 — Instacash (MoneyLion) reconciliation.** Traced the ~$234.90
  residual to a missing 6/20/2026 $620 advance (never entered in the ledger).
  Confirmed with the user: both the 7/17 ($443.03) and 7/20 ($234.90)
  repayments went to that advance, with a ~$57.93 fee bundled into the 7/17
  charge (never counted toward the balance — same treatment as the 8/14 Cleo
  Express Fee earlier today). New migration
  `scripts/migrations/2026-09-04-instacash-reconcile.sql` (+ `.verify.sql`):
  adds the missing 6/20 advance transaction + matching `debt_adjustments` row,
  re-links the 7/17 payment and splits it into $385.10 principal + $57.93 fee.
  Advances (3,020.00) − principal repayments (2,420.00) = $600.00, matching
  the stored `remaining_balance` exactly. **Not yet run** — needs the user to
  execute it manually in the Supabase SQL Editor (read-only MCP can't write).
  No schema change; no new ADR (data-only, same pattern as the 2026-09-04
  Cleo/Instacash cleanup under ADR-046/ADR-056).
  - The reconcile script got run twice by accident, duplicating 3 rows (the
    6/20 advance transaction, its `debt_adjustments` row, and the 7/17 fee
    transaction — the one `update` in the script is idempotent, no issue
    there). `scripts/migrations/2026-09-04-instacash-reconcile-dedupe.sql`
    (+ `.verify.sql`) removed the second run's 3 duplicate rows by explicit
    id. Both scripts run + verified live 2026-09-04: 12 Instacash
    transactions, no duplicates, advances $3,020.00 − repaid $2,420.00 =
    $600.00, matching the stored `remaining_balance`. Issue #58 closed.
