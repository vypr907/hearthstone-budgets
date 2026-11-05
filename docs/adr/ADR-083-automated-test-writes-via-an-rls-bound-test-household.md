## ADR-083: Automated Test Writes via an RLS-Bound Test Household

Decision:
Claude (and any automated test tooling) may create and mutate data ONLY in the
"TEST Household — Lovable QA" household (`e79216a0-b5f9-4987-a675-c52783bddab7`),
never in "Our Household" (`cd8bce8c-81af-4302-8019-113e352ed443`).

The boundary is Postgres Row-Level Security, not a code convention. Test tooling
authenticates a `@supabase/supabase-js` client as
`steven.laszloffy+lovabletest@gmail.com` (role `authenticated`, `rolbypassrls =
false`) using the public anon/publishable key — the same key the app ships. That
user is a member of exactly one household (the test one). Every data table's
policy is `is_household_member(household_id)` for both `USING` and `WITH CHECK`,
so the database physically rejects any read or write the test user attempts
against the real household (`INSERT` → `42501 new row violates row-level
security policy`; `UPDATE`/`DELETE` → 0 rows, filtered by `USING`). Verified
2026-08-26.

Rules:
- Automated test DB access goes through `scripts/test-db.mjs` (`testClient()`),
  which signs in, asserts the user reaches exactly one household and it is the
  test one, probes that the real household is invisible, and only then returns a
  client. `inTestHousehold(row)` stamps/asserts `household_id` on every write.
- The read-only Supabase MCP stays read-only. It is privileged (sees all
  households) and is for verification only.
- Claude must NEVER be given the `service_role` key or a direct `postgres`
  connection string — both have `BYPASSRLS` and would defeat the boundary. This
  is the load-bearing rule; RLS + FORCE only protect the `authenticated` path.
- Never add `steven.laszloffy+lovabletest@gmail.com` to "Our Household". Never
  put the real users' credentials in `.env.test`.
- Test credentials live in a gitignored `.env.test` at the repo root.
- Before a writing test session, run `scripts/test-db-preflight.sql` via the
  read-only MCP; every check must pass.

Schema dependency (see `scripts/migrations/2026-08-26-rls-hardening.sql`):
- REQUIRED: `auto_transfers` shipped in ADR-081 with RLS disabled (any
  authenticated user could touch any household's rows — a live bug, not just a
  test gap). Enable RLS + add the `household access` policy.
- Optional: `force row level security` on all 24 tables. Honest note — with
  every table owned by `postgres` (BYPASSRLS), FORCE is a near-no-op today; it
  is future-proofing for a table later owned by a non-bypass role. Confirmed it
  does not break the `is_household_member` SECURITY DEFINER function (also owned
  by `postgres`).

Reason:
Interactive/E2E verification of ledger-touching changes (cycle resets,
auto-transfer processing, deduction funding) needs a real logged-in session and
real row mutations — a unit test can't cover the hook-to-Postgres wiring or the
RLS/schema-cache failure modes. Doing that against the real household risks
corrupting live financial data. A second Supabase project was rejected as too
heavy (double migrations, schema drift, extra keys). An RLS-bound test user in
the same project gives isolation the database enforces, with zero schema
divergence.

Status: Decided 2026-08-26. Implemented 2026-08-26 (`scripts/test-db.mjs`,
`scripts/test-db-preflight.sql`, `.env.test` gitignored, CLAUDE.md rules).
`scripts/migrations/2026-08-26-rls-hardening.sql` run and verified live
2026-08-26: `auto_transfers` now has RLS + the `household access` policy, and
all 24 public tables have `relforcerowsecurity = true`. Boundary re-proven after
the migration (INSERT into "Our Household" → `42501`; `is_household_member`
SECURITY DEFINER still resolves under FORCE). The test-user password was rotated
off the transcript value the same day (`.env.test`).

