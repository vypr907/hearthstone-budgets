import { describe, expect, it } from "vitest";
import { deriveAutoTransferState, isAutoTransferOverdue } from "./auto-transfers";
import type { AutoTransfer, Transaction } from "./supabase";

const at = (over: Partial<AutoTransfer> = {}): AutoTransfer =>
  ({
    id: "at1",
    household_id: "h",
    name: "SoFi sweep",
    from_account_id: "checking",
    to_account_id: "sofi",
    amount: 500,
    billing_cycle: "monthly",
    cycle_interval_days: null,
    next_due_date: "2026-09-10",
    is_active: true,
    ...over,
  }) as AutoTransfer;

const creditLeg = (over: Partial<Transaction> = {}): Transaction =>
  ({
    id: "t1",
    household_id: "h",
    account_id: "sofi",
    amount: 500,
    status: "cleared",
    transaction_date: "2026-08-26",
    transfer_group_id: "g1",
    linked_auto_transfer_id: "at1",
    resolved_cycle_due_date: "2026-08-10",
    ...over,
  }) as Transaction;

describe("deriveAutoTransferState", () => {
  it("is unpaid with the full amount owed before the cycle is processed", () => {
    const info = deriveAutoTransferState(at({ next_due_date: "2026-09-10" }), [], "2026-08-26");
    expect(info.state).toBe("unpaid");
    expect(info.remaining).toBe(500);
    expect(info.resolved).toBe(false);
  });

  it("stays unpaid once the due date has passed with nothing processed", () => {
    const info = deriveAutoTransferState(at({ next_due_date: "2026-08-10" }), [], "2026-08-26");
    expect(info.state).toBe("unpaid");
  });

  it("reads cleared for a cycle processed early (due date still in the future)", () => {
    // Processed on 08-05, before the 08-10 due date; processing advanced
    // next_due_date to 09-10, and the credit leg is tagged to the 08-10 cycle.
    const info = deriveAutoTransferState(
      at({ next_due_date: "2026-09-10" }),
      [creditLeg({ transaction_date: "2026-08-05", resolved_cycle_due_date: "2026-08-10" })],
      "2026-08-08",
    );
    expect(info.state).toBe("cleared");
    expect(info.remaining).toBe(0);
    expect(info.resolved).toBe(true);
  });

  it("reads cleared for a cycle processed LATE, until the new due date arrives", () => {
    // Was due 08-10, processed on 08-26 (late); next_due_date advanced to
    // 09-10, credit leg tagged to the 08-10 cycle. Should still show cleared.
    const info = deriveAutoTransferState(
      at({ next_due_date: "2026-09-10" }),
      [creditLeg({ transaction_date: "2026-08-26", resolved_cycle_due_date: "2026-08-10" })],
      "2026-08-26",
    );
    expect(info.state).toBe("cleared");
    expect(info.resolved).toBe(true);
  });

  it("flips back to unpaid once the new due date is reached", () => {
    // Same processed leg, but now we're past the advanced 09-10 due date — the
    // next cycle genuinely needs processing.
    const info = deriveAutoTransferState(
      at({ next_due_date: "2026-09-10" }),
      [creditLeg({ transaction_date: "2026-08-26", resolved_cycle_due_date: "2026-08-10" })],
      "2026-09-12",
    );
    expect(info.state).toBe("unpaid");
  });

  it("ignores a leg tagged to an earlier, already-closed cycle", () => {
    // next_due_date is 09-10; a leg tagged to the 07-10 cycle must not make the
    // current cycle read as cleared.
    const info = deriveAutoTransferState(
      at({ next_due_date: "2026-09-10" }),
      [creditLeg({ resolved_cycle_due_date: "2026-07-10", transaction_date: "2026-07-09" })],
      "2026-09-01",
    );
    expect(info.state).toBe("unpaid");
  });

  it("only counts cleared legs", () => {
    const info = deriveAutoTransferState(
      at({ next_due_date: "2026-09-10" }),
      [creditLeg({ status: "pending", transaction_date: "2026-08-05" })],
      "2026-08-08",
    );
    expect(info.state).toBe("unpaid");
  });
});

describe("isAutoTransferOverdue", () => {
  it("is true when unpaid and the due date has passed", () => {
    const a = at({ next_due_date: "2026-08-10" });
    const info = deriveAutoTransferState(a, [], "2026-08-26");
    expect(isAutoTransferOverdue(a, info, "2026-08-26")).toBe(true);
  });

  it("is false when the due date is still ahead", () => {
    const a = at({ next_due_date: "2026-09-10" });
    const info = deriveAutoTransferState(a, [], "2026-08-26");
    expect(isAutoTransferOverdue(a, info, "2026-08-26")).toBe(false);
  });

  it("is false once the cycle is processed", () => {
    const a = at({ next_due_date: "2026-09-10" });
    const info = deriveAutoTransferState(
      a,
      [creditLeg({ transaction_date: "2026-08-05", resolved_cycle_due_date: "2026-08-10" })],
      "2026-08-08",
    );
    expect(isAutoTransferOverdue(a, info, "2026-08-08")).toBe(false);
  });
});
