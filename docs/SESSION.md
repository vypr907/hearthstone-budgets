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