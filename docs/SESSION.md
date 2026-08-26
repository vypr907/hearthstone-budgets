## Session Notes

- 2026-08-26 — ADR-083: automated test-DB write access, bounded to the test
  household by Postgres RLS.
  - Verified the boundary: the `+lovabletest` user is a member of exactly one
    household ("TEST Household — Lovable QA"); every data table's policy is
    `is_household_member(household_id)` for USING + WITH CHECK; `authenticated`
    has `rolbypassrls=false`. Proved live: INSERT into "Our Household" →
    `42501 row-level security policy` rejection; UPDATE → 0 rows.
  - `scripts/test-db.mjs` — `testClient()` signs in as the RLS-bound test user,
    asserts single-household + probes that the real household is invisible, then
    returns the client. `inTestHousehold()` stamps/asserts `household_id`.
  - `scripts/test-db-preflight.sql` — MCP checks to run before a writing session.
  - `scripts/migrations/2026-08-26-rls-hardening.sql` — for the USER to run:
    Part 1 (required) enables RLS on `auto_transfers` (shipped in ADR-081 with
    RLS DISABLED — a live bug); Part 2 (optional) `force row level security` on
    all 24 tables (near-no-op today, future-proofing).
  - `.env.test` (gitignored) holds the test-user creds.
  - Docs: ADR-083, ADR-081 addendum (auto_transfers RLS), SCHEMA.md RLS section,
    CLAUDE.md "Testing against the database" hard-rule section.
  - Load-bearing rule recorded: Claude must never get the `service_role` key or
    a direct `postgres` connection string.
  tsc + 87 tests green. Pending: user runs the migration (Part 1) + rotates the
  `letmein` throwaway password.

- 2026-08-26 — ADR-084: "Log a payment to this debt" on Debt detail.
  - New `useLogDebtPayment()` + `isWithinCurrentCycle()`/`debtCycleWindowStart()`
    in `src/lib/payments.ts`; extracted the shared `feeCategoryId()` helper out
    of `insertFeeTransaction`.
  - New `src/components/LogDebtPaymentDialog.tsx`, rendered under `PayActions`
    in `src/routes/app.debts.tsx`.
  - Date-driven: in-cycle → normal payment path; earlier → balance + ledger only
    (form shows which mode it's in). Fee/interest lines post their own
    transactions against the paying account and never move the debt balance.
  - Files: src/lib/payments.ts, src/components/LogDebtPaymentDialog.tsx,
    src/routes/app.debts.tsx, docs/DECISIONS.md.

- 2026-08-26 — ADR-085: Debt detail reports the ledger-derived cycle + shows its window.
  - Detail's "Payment status", "Paid this cycle" and "Still owed this cycle" now
    come from `deriveCycleInfo` (ADR-036) instead of the raw `payment_status` /
    `cycle_paid_to_date` columns, which read as "pending, $0 paid, $106.30 owed"
    right after a monthly cycle is fully paid (monthly clears reset
    `cycle_paid_to_date` to 0 and nothing rewrites a stale `payment_status`).
    A stored value that disagrees is shown as a small "stored: …" note.
  - `CycleInfo` gained `windowStart`/`windowEnd`; new "Cycle window" field shows
    the exact date range the math counted, and "Pay period" shows which primary
    paycheck period the due date falls into (`periodRange`/`inRange`).
  - Files: src/lib/ledger-state.ts, src/lib/auto-transfers.ts,
    src/routes/app.debts.tsx, docs/DECISIONS.md.
- Debt detail cycle-window clarity + stored-status repair (ADR-085 addendum).
  - "Cycle window" now shows the real billing period (one cycle back from the
    effective due date to that due date, e.g. Jul 21 – Aug 21); the narrower
    derivation range is shown beneath it as a "counting …" sub-line.
  - When the stored `payment_status` disagrees with the ledger-derived state, a
    "Sync stored status" button writes the derived state (and cycle_paid_to_date)
    back onto the debt row via the new `useSyncStoredStatus()` hook.
  - Files: src/lib/payments.ts, src/routes/app.debts.tsx, docs/DECISIONS.md.
- 2026-08-26 — ADR-086: monthly cycles = the calendar month.
  - Drift check (via the app's read path, 42 debts): 4 rows with `next_due_date`
    off `due_day` — Aarons - Dresser (21 → Aug 18), Alpine Medical - Stephanie
    (18 → Jul 29), GTC and FM Jewelry (biweekly). `bills` has no `due_day`
    column, so due-day anchoring was not viable; calendar month chosen instead.
  - `deriveCycleInfo` counts monthly items over `YYYY-MM-01 … month end`;
    ADR-075 tag exclusion compares by month for monthly; non-monthly logic and
    the resolved-lookback branch untouched. `resolved` still set when a cleared
    monthly cycle's `next_due_date` sits past the month end.
  - Debt detail "Cycle window" shows the counted month; billing period is now
    the secondary line and only for non-monthly cycles.
  - Files: src/lib/ledger-state.ts, src/lib/ledger-state.test.ts,
    src/routes/app.debts.tsx, docs/DECISIONS.md. 88 tests green.
