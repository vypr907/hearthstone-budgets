/**
 * Smoke test for the 10 RPCs added by
 * scripts/migrations/2026-09-24-atomic-payment-undo-rpcs.sql (ADR-101
 * addendum, Issue #67). RPC calls directly against the TEST household — no
 * UI/Playwright needed, same style as the 2026-09-13 addendum's
 * verify-cleared-payment.mjs.
 *
 * Usage: node scripts/smoke/verify-payment-undo-rpcs.mjs
 * Requires SMOKE_EMAIL/SMOKE_PASSWORD (or a gitignored .env.test at the repo
 * root) for the RLS-bound test user — see ADR-083 / scripts/smoke/README.md.
 * Run scripts/test-db-preflight.sql via the MCP first; every check must pass.
 *
 * Creates one throwaway debt and one throwaway bill in "TEST Household —
 * Lovable QA", mutates them directly between scenarios to set up each
 * starting state (not through the RPCs being tested), and deletes both rows
 * in a `finally` block regardless of outcome.
 */
import { testClient, inTestHousehold } from "../test-db.mjs";

let passed = 0;
let failed = 0;

function check(label, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  ✓ ${label}`);
  } else {
    failed++;
    console.error(`  ✗ ${label}${extra !== undefined ? ` (got: ${JSON.stringify(extra)})` : ""}`);
  }
}

async function main() {
  const { sb } = await testClient();
  let debtId;
  let billId;

  try {
    // ---- fixtures ----
    {
      const { data, error } = await sb
        .from("debts")
        .insert(
          inTestHousehold({
            name: "SMOKE debt (safe to delete)",
            debt_type: "loan",
            remaining_balance: 1000,
            minimum_payment: 100,
            billing_cycle: "monthly",
            next_due_date: "2026-10-01",
            cycle_paid_to_date: 0,
          }),
        )
        .select()
        .single();
      if (error) throw error;
      debtId = data.id;
    }
    {
      const { data, error } = await sb
        .from("bills")
        .insert(
          inTestHousehold({
            name: "SMOKE bill (safe to delete)",
            amount: 200,
            billing_cycle: "monthly",
            next_due_date: "2026-10-01",
            cycle_paid_to_date: 0,
          }),
        )
        .select()
        .single();
      if (error) throw error;
      billId = data.id;
    }

    // ---- 1. apply_debt_mark_unpaid: partial-cycle undo ----
    console.log("apply_debt_mark_unpaid (partial cycle)");
    await sb.from("debts").update({ remaining_balance: 1000, cycle_paid_to_date: 40, payment_status: "pending" }).eq("id", debtId);
    {
      const { data, error } = await sb.rpc("apply_debt_mark_unpaid", { p_debt_id: debtId, p_amount: 40, p_was_cleared: true });
      check("no error", !error, error?.message);
      check("remaining_balance -> 1040", Number(data?.remaining_balance) === 1040, data?.remaining_balance);
      check("cycle_paid_to_date -> 0", Number(data?.cycle_paid_to_date) === 0, data?.cycle_paid_to_date);
      check("payment_status -> unpaid", data?.payment_status === "unpaid", data?.payment_status);
      check("next_due_date unchanged", data?.next_due_date === "2026-10-01", data?.next_due_date);
    }

    // ---- 2. apply_debt_mark_unpaid: resolved-cycle undo (biweekly, reverses due date) ----
    console.log("apply_debt_mark_unpaid (resolved cycle, biweekly)");
    await sb.from("debts").update({
      remaining_balance: 1040, cycle_paid_to_date: 0, billing_cycle: "biweekly", next_due_date: "2026-11-01", payment_status: "cleared",
    }).eq("id", debtId);
    {
      const { data, error } = await sb.rpc("apply_debt_mark_unpaid", { p_debt_id: debtId, p_amount: 100, p_was_cleared: true });
      check("no error", !error, error?.message);
      check("remaining_balance -> 1140", Number(data?.remaining_balance) === 1140, data?.remaining_balance);
      check("next_due_date reversed 14d -> 2026-10-18", data?.next_due_date === "2026-10-18", data?.next_due_date);
    }

    // ---- 3. apply_bill_mark_unpaid: partial-cycle undo ----
    console.log("apply_bill_mark_unpaid (partial cycle)");
    await sb.from("bills").update({ cycle_paid_to_date: 50, payment_status: "pending" }).eq("id", billId);
    {
      const { data, error } = await sb.rpc("apply_bill_mark_unpaid", { p_bill_id: billId, p_amount: 50, p_was_cleared: true });
      check("no error", !error, error?.message);
      check("cycle_paid_to_date -> 0", Number(data?.cycle_paid_to_date) === 0, data?.cycle_paid_to_date);
      check("payment_status -> unpaid", data?.payment_status === "unpaid", data?.payment_status);
    }

    // ---- 4. apply_debt_cycle_reset ----
    console.log("apply_debt_cycle_reset (resolved, biweekly)");
    await sb.from("debts").update({
      remaining_balance: 900, cycle_paid_to_date: 0, billing_cycle: "biweekly", next_due_date: "2026-11-15", payment_status: "cleared",
    }).eq("id", debtId);
    {
      const { data, error } = await sb.rpc("apply_debt_cycle_reset", { p_debt_id: debtId, p_cleared_total: 240, p_resolved: true });
      check("no error", !error, error?.message);
      check("remaining_balance -> 1140", Number(data?.remaining_balance) === 1140, data?.remaining_balance);
      check("cycle_paid_to_date -> 0", Number(data?.cycle_paid_to_date) === 0, data?.cycle_paid_to_date);
      check("payment_status -> unpaid", data?.payment_status === "unpaid", data?.payment_status);
      check("next_due_date reversed 14d -> 2026-11-01", data?.next_due_date === "2026-11-01", data?.next_due_date);
    }

    // ---- 5. apply_bill_cycle_reset ----
    console.log("apply_bill_cycle_reset (not resolved)");
    await sb.from("bills").update({ cycle_paid_to_date: 100, payment_status: "pending", next_due_date: "2026-10-01" }).eq("id", billId);
    {
      const { data, error } = await sb.rpc("apply_bill_cycle_reset", { p_bill_id: billId, p_resolved: false });
      check("no error", !error, error?.message);
      check("cycle_paid_to_date -> 0", Number(data?.cycle_paid_to_date) === 0, data?.cycle_paid_to_date);
      check("payment_status -> unpaid", data?.payment_status === "unpaid", data?.payment_status);
      check("next_due_date unchanged", data?.next_due_date === "2026-10-01", data?.next_due_date);
    }

    // ---- 6. apply_debt_payment_reversal (advance debt: minimum_payment mirrors) ----
    console.log("apply_debt_payment_reversal (advance debt)");
    await sb.from("debts").update({
      debt_type: "advance", remaining_balance: 500, minimum_payment: 500, cycle_paid_to_date: 60, payment_status: "pending",
    }).eq("id", debtId);
    {
      const { data, error } = await sb.rpc("apply_debt_payment_reversal", { p_debt_id: debtId, p_amount: 60 });
      check("no error", !error, error?.message);
      check("remaining_balance -> 560", Number(data?.remaining_balance) === 560, data?.remaining_balance);
      check("cycle_paid_to_date -> 0", Number(data?.cycle_paid_to_date) === 0, data?.cycle_paid_to_date);
      check("minimum_payment mirrors -> 560 (advance)", Number(data?.minimum_payment) === 560, data?.minimum_payment);
      check("payment_status -> unpaid (0 < 560)", data?.payment_status === "unpaid", data?.payment_status);
    }
    await sb.from("debts").update({ debt_type: "loan", minimum_payment: 100 }).eq("id", debtId);

    // ---- 7. apply_bill_payment_reversal ----
    console.log("apply_bill_payment_reversal");
    await sb.from("bills").update({ cycle_paid_to_date: 200, cycle_amount_due: 200, payment_status: "cleared" }).eq("id", billId);
    {
      const { data, error } = await sb.rpc("apply_bill_payment_reversal", { p_bill_id: billId, p_amount: 200 });
      check("no error", !error, error?.message);
      check("cycle_paid_to_date -> 0", Number(data?.cycle_paid_to_date) === 0, data?.cycle_paid_to_date);
      check("payment_status -> unpaid", data?.payment_status === "unpaid", data?.payment_status);
    }

    // ---- 8. rollback_cleared_debt_payment (with resolvedDueDate) ----
    console.log("rollback_cleared_debt_payment (resolved-due-date restore)");
    await sb.from("debts").update({ remaining_balance: 460, cycle_paid_to_date: 0, next_due_date: "2026-11-01", payment_status: "cleared" }).eq("id", debtId);
    {
      const { data, error } = await sb.rpc("rollback_cleared_debt_payment", {
        p_debt_id: debtId, p_amount: 100, p_resolved_due_date: "2026-10-01",
      });
      check("no error", !error, error?.message);
      check("remaining_balance -> 560", Number(data?.remaining_balance) === 560, data?.remaining_balance);
      check("next_due_date restored exactly -> 2026-10-01", data?.next_due_date === "2026-10-01", data?.next_due_date);
      check("payment_status -> unpaid", data?.payment_status === "unpaid", data?.payment_status);
    }

    // ---- 9. rollback_cleared_bill_payment (no resolvedDueDate, still short) ----
    console.log("rollback_cleared_bill_payment (partial, pending)");
    await sb.from("bills").update({ cycle_paid_to_date: 150, cycle_amount_due: 200, payment_status: "cleared" }).eq("id", billId);
    {
      const { data, error } = await sb.rpc("rollback_cleared_bill_payment", { p_bill_id: billId, p_amount: 50, p_resolved_due_date: null });
      check("no error", !error, error?.message);
      check("cycle_paid_to_date -> 100", Number(data?.cycle_paid_to_date) === 100, data?.cycle_paid_to_date);
      check("payment_status -> pending (100 > 0.005)", data?.payment_status === "pending", data?.payment_status);
    }

    // ---- 10. correct_cleared_debt_payment ----
    console.log("correct_cleared_debt_payment (in-bounds correction)");
    await sb.from("debts").update({ remaining_balance: 460, cycle_paid_to_date: 40, minimum_payment: 100, debt_type: "loan" }).eq("id", debtId);
    {
      const { data, error } = await sb.rpc("correct_cleared_debt_payment", {
        p_debt_id: debtId, p_original_amount: 40, p_new_amount: 60, p_date: "2026-09-24",
      });
      check("no error", !error, error?.message);
      check("cycle_paid_to_date -> 60", Number(data?.cycle_paid_to_date) === 60, data?.cycle_paid_to_date);
      check("remaining_balance -> 440", Number(data?.remaining_balance) === 440, data?.remaining_balance);
    }
    console.log("correct_cleared_debt_payment (guard: would resolve the cycle)");
    {
      const { error } = await sb.rpc("correct_cleared_debt_payment", {
        p_debt_id: debtId, p_original_amount: 60, p_new_amount: 100, p_date: "2026-09-24",
      });
      check("rejected with CORRECT_PAYMENT_WOULD_RESOLVE sentinel", /CORRECT_PAYMENT_WOULD_RESOLVE/.test(error?.message ?? ""), error?.message);
    }

    // ---- 11. correct_cleared_bill_payment ----
    console.log("correct_cleared_bill_payment (in-bounds correction)");
    await sb.from("bills").update({ cycle_paid_to_date: 100, cycle_amount_due: 200 }).eq("id", billId);
    {
      const { data, error } = await sb.rpc("correct_cleared_bill_payment", {
        p_bill_id: billId, p_original_amount: 100, p_new_amount: 120,
      });
      check("no error", !error, error?.message);
      check("cycle_paid_to_date -> 120", Number(data?.cycle_paid_to_date) === 120, data?.cycle_paid_to_date);
    }

    // ---- 12. rebuild_bill_cycle_amount_due (via apply_bill_cycle_reset, with an adjustment in-window) ----
    console.log("rebuild_bill_cycle_amount_due (via apply_bill_cycle_reset, with active adjustment)");
    await sb.from("bills").update({ cycle_paid_to_date: 50, next_due_date: "2026-10-01", amount: 200 }).eq("id", billId);
    const { data: adj, error: adjErr } = await sb
      .from("bill_adjustments")
      .insert(inTestHousehold({ bill_id: billId, amount: 25, adjustment_date: "2026-09-20", affects_balance: true }))
      .select()
      .single();
    if (adjErr) throw adjErr;
    {
      const { data, error } = await sb.rpc("apply_bill_cycle_reset", { p_bill_id: billId, p_resolved: false });
      check("no error", !error, error?.message);
      check("cycle_amount_due rebuilt -> 225 (200 + 25 adjustment)", Number(data?.cycle_amount_due) === 225, data?.cycle_amount_due);
    }
    await sb.from("bill_adjustments").delete().eq("id", adj.id);
  } finally {
    if (debtId) await sb.from("debts").delete().eq("id", debtId);
    if (billId) await sb.from("bills").delete().eq("id", billId);
    console.log(`\n${passed} passed, ${failed} failed`);
    if (failed > 0) process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exitCode = 1;
});
