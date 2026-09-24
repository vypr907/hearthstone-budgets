# SESSION.md

## Session Notes

- **Issue #68** — wrote `scripts/migrations/2026-09-24-cash-checks-legacy-recategorize.sql`
  (+ `.verify.sql`) to recategorize the 2 legacy "Cash & Checks" transactions
  (both 2026-07-02, $60 total, ATM withdrawal fully spent same-day at
  Nature's Releaf) to "Green," matching every sibling transaction at that
  merchant. Cites ADR-103, no new ADR. User applied the migration manually
  in the Supabase SQL Editor; re-verified via the read-only MCP — both rows
  now categorized "Green."

- **Issue #74** — ADR-109. Added `reverseOpaqueTransferIds()`
  (`src/lib/internal-transfers.ts`), extended `monthlyIncomeVsExpenses()`
  (`src/lib/paycheck-budget.ts`) with an `accounts` param, wired into
  `src/routes/app.year-in-review.tsx`. Also fixed a pre-existing bug found
  during research: this function never excluded ordinary two-sided internal
  transfers, so they were inflating "expenses" in Year in Review — fixed as
  part of the same change (bundled deliberately, documented in ADR-109).
  Added 3 tests to `src/lib/paycheck-budget.test.ts`. `tsc --noEmit` clean,
  246/246 tests pass. No schema change, no manual SQL needed.
  - Known issue: not yet checked in a running browser (sandbox networking
    can't reach the dev server) — needs a Codespace or real terminal pass.

- **Issue #67** — ADR-101 addendum written (2026-09-24). Both migrations
  applied by the user and verified via the read-only MCP: all 11 new
  functions (10 RPCs + `rebuild_bill_cycle_amount_due`) present as
  `security invoker`. Updated all 5 functions in `src/lib/payments.ts`
  (`useMarkUnpaid`, `useResetCycle`, `useReversePayment`,
  `rollbackClearedPayment`, `useCorrectPayment`) to call the new RPCs;
  `useCorrectPayment` keeps its client-side validation as a fast pre-check
  and gained `translateCorrectPaymentError()` to translate the RPC's
  sentinel error back into the existing friendly message. Removed now-dead
  `fetchBillAdjustments` and the now-unused `advanceDate`/`reverseDate`
  imports (their only remaining call sites were the code just replaced).
  Left `advanceMinimumPaymentPatch`/`rebuiltCycleAmountDue` in place even
  though no production code calls them anymore — they're exported,
  individually tested pure ports of the business rules the new SQL now
  also implements, and doubled as the spec I diffed the SQL against; worth
  a follow-up decision on whether to delete them later, not done
  unprompted here. `tsc --noEmit` clean, 246/246 tests pass.
  - ADR-083 pre-flight (`scripts/test-db-preflight.sql`, via MCP): all 5
    checks pass.
  - Wrote and ran `scripts/smoke/verify-payment-undo-rpcs.mjs` (12
    scenarios covering all 10 RPCs + `rebuild_bill_cycle_amount_due`):
    **43/43 pass**. TEST household confirmed clean afterward via MCP (no
    orphaned rows). Test user's `.env.test` password had expired/was
    unknown — reset via the Supabase Auth REST API directly (curl'd the
    recovery-email verify link with redirects disabled to capture the
    `access_token`, since the app has no dedicated password-reset page and
    the email's redirect target isn't reachable outside a running dev
    server) rather than through the app UI.
  - Known issue: not yet checked in a running browser — sandbox networking
    can't reach the dev server; needs a Codespace or real terminal pass.
