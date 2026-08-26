/**
 * Guarded Supabase client for the TEST household ONLY.
 *
 * HARD BOUNDARY: Postgres Row-Level Security. Every data table's policy is
 * `is_household_member(household_id)` for both USING and WITH CHECK, and the
 * `authenticated` role has `rolbypassrls = false`. The test user
 * (`steven.laszloffy+lovabletest@gmail.com`) is a member of exactly one
 * household — "TEST Household — Lovable QA". So the database itself rejects any
 * read or write this module attempts against "Our Household". The only way past
 * RLS is the service_role key, which this module never uses (anon key only).
 *
 * The asserts below are defense-in-depth: they fail fast with a clear message
 * if the RLS config ever regresses, rather than letting a test silently run
 * against the wrong data.
 *
 * See docs/DECISIONS.md ADR-083.
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const SUPABASE_URL = "https://ilxwhgqudcxsgxrvxhtb.supabase.co";
// Public publishable key — identical to src/lib/supabase.ts. NOT a secret.
const ANON_KEY = "sb_publishable_Q56nrfX0_LE4cuKWzYYk4g_nFURfIN5";

export const TEST_HOUSEHOLD_ID = "e79216a0-b5f9-4987-a675-c52783bddab7";
export const TEST_HOUSEHOLD_NAME = "TEST Household — Lovable QA";
/** "Our Household" — the real data. This module must never be able to touch it. */
const REAL_HOUSEHOLD_ID = "cd8bce8c-81af-4302-8019-113e352ed443";

function loadCreds() {
  let email = process.env.SMOKE_EMAIL || process.env.TEST_DB_EMAIL;
  let password = process.env.SMOKE_PASSWORD || process.env.TEST_DB_PASSWORD;
  if (!email || !password) {
    try {
      const root = dirname(dirname(fileURLToPath(import.meta.url)));
      const txt = readFileSync(join(root, ".env.test"), "utf8");
      for (const line of txt.split("\n")) {
        const m = line.match(/^\s*(?:export\s+)?([A-Z_]+)\s*=\s*"?([^"\n]*)"?\s*$/);
        if (!m) continue;
        if (/EMAIL$/.test(m[1])) email ||= m[2];
        if (/PASSWORD$/.test(m[1])) password ||= m[2];
      }
    } catch {
      /* no .env.test — fall through to the error below */
    }
  }
  if (!email || !password) {
    throw new Error(
      "test-db: no credentials. Set SMOKE_EMAIL / SMOKE_PASSWORD, or create a gitignored .env.test at the repo root.",
    );
  }
  return { email, password };
}

/**
 * Sign in as the test user and verify the RLS boundary before returning the
 * client. Throws (does not return a client) if anything is off.
 */
export async function testClient() {
  const { email, password } = loadCreds();
  const sb = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({ email, password });
  if (authErr) throw new Error("test-db: login failed — " + authErr.message);

  // Guard 1: the signed-in user must reach exactly one household — the test one.
  const { data: memberships, error: mErr } = await sb.from("household_members").select("household_id");
  if (mErr) throw new Error("test-db: cannot read memberships — " + mErr.message);
  const households = [...new Set((memberships ?? []).map((m) => m.household_id))];
  if (households.length !== 1 || households[0] !== TEST_HOUSEHOLD_ID) {
    await sb.auth.signOut();
    throw new Error(
      `test-db: REFUSING. Signed-in user reaches households ${JSON.stringify(households)}; ` +
        `expected only the test household [${TEST_HOUSEHOLD_ID}]. ` +
        `Do NOT proceed — check household_members.`,
    );
  }

  // Guard 2: RLS must actually hide the real household. A read scoped to it
  // must come back empty (RLS filters it), and the household row must be
  // invisible. If either leaks, RLS has regressed — abort.
  const leakBills = await sb.from("bills").select("id").eq("household_id", REAL_HOUSEHOLD_ID).limit(1);
  const leakHh = await sb.from("households").select("id").eq("id", REAL_HOUSEHOLD_ID).limit(1);
  if ((leakBills.data && leakBills.data.length) || (leakHh.data && leakHh.data.length)) {
    await sb.auth.signOut();
    throw new Error(
      "test-db: RLS PROBE FAILED — data from 'Our Household' is visible to the test user. " +
        "RLS has regressed on at least one table. Aborting.",
    );
  }

  return { sb, userId: auth.user.id, householdId: TEST_HOUSEHOLD_ID };
}

/**
 * Stamp `household_id` with the test household and reject a row that already
 * carries a different one. Use on every insert payload.
 */
export function inTestHousehold(row) {
  if (row && row.household_id && row.household_id !== TEST_HOUSEHOLD_ID) {
    throw new Error(
      `test-db: row targets household_id ${row.household_id}, not the test household. Refusing.`,
    );
  }
  return { ...row, household_id: TEST_HOUSEHOLD_ID };
}
