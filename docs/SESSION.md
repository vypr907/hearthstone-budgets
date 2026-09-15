# SESSION.md

## Session Notes
- **Cleo advance debt: diagnosed + fixed corrupted remaining_balance
  (should be $70, was $55).** User reported two $55 advances taken but
  balance only showing $55. Verified live via the read-only MCP:
  `debt_adjustments` (immune to the bug) confirms two real, distinct $55
  advances (9/4, 9/5) plus an earlier $40 advance/repayment cycle already
  netting to $0 by 8/14. Root cause #1: the two $55 advances were written
  16 seconds apart on 9/6 — before this session's ADR-101 atomic-RPC fix
  existed (applied 9/11) — so the second write overwrote the first instead
  of adding (same bug class as Dave ExtraCash/EarnIn, never individually
  repaired for Cleo until now). Root cause #2: a $17.98 "Express Fee" was
  entered as both a balance-increasing Adjustment and a balance-decreasing
  payment transaction — user confirmed both are real and should cancel out,
  and should properly be two separate $8.99 fees (one per advance),
  matching the debt's own existing non-balance-affecting `Fee:` convention
  from an earlier 8/14 $6.99 fee. Correct balance computed two independent
  ways (debt_adjustments-minus-repayments, and a write-order balance walk):
  $70.00. Wrote `scripts/migrations/2026-09-15-cleo-advance-fix.sql` (+
  `.verify.sql`) — deletes the erroneous adjustment + transaction, inserts
  two proper $8.99 `Fee:` transactions (9/4, 9/5), sets
  `remaining_balance`/`minimum_payment` to 70.00. `cycle_paid_to_date`/
  `payment_status`/`next_due_date` (2026-09-10, user-confirmed correct)
  untouched. No schema change, no ADR (data-only). Not yet applied — user
  runs it manually.
- **Cleo fix corrected — the $70.00 draft above was wrong.** User caught it:
  a second -$40 "Debt payment · Cleo" transaction (dated 7/17, backfilled
  9/10) was wrongly subtracted — it predates any advance on record for this
  debt (created 8/13, first recorded advance 8/8), so it was repaying an
  advance never entered. User confirmed: a real $40 Cleo advance on
  2026-07-09 was simply missing. Also corrected: the two replacement $8.99
  fee transactions are dated 9/13 (when actually paid, via Venmo), not
  9/4/9/5 (the advance dates) — confirmed the 9a1a0f9a… account used in the
  existing fee precedent is indeed "Venmo - Steven". Rewrote
  `scripts/migrations/2026-09-15-cleo-advance-fix.sql` (+ `.verify.sql`):
  adds the missing 7/9 $40 advance (adjustment + transaction), removes the
  erroneous $17.98 double-entry, adds two $8.99 `Fee:` transactions dated
  9/13, sets `remaining_balance`/`minimum_payment` to **110.00** (advances
  40+40+55+55=190 minus real repayments 40+40=80). Verified the arithmetic
  independently. Not yet applied — user runs it manually.
