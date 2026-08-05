import { describe, expect, it } from "vitest";
import { deriveCycleInfo } from "@/lib/ledger-state";
import { toPayable } from "@/lib/payments";
import type { Bill, Transaction } from "@/lib/supabase";

const TODAY = "2026-08-05";

const rent = (over: Partial<Bill> = {}) =>
  ({
    id: "rent2",
    name: "Rent 2",
    amount: 609,
    billing_cycle: "monthly",
    next_due_date: "2026-08-15",
    cycle_amount_due: null,
    cycle_paid_to_date: 0,
    category_id: null,
    institution_id: null,
    ...over,
  }) as unknown as Bill;

const tx = (amount: number, status: string, id: string): Transaction =>
  ({
    id,
    amount: -amount,
    status,
    transaction_date: TODAY,
    linked_bill_id: "rent2",
    linked_debt_id: null,
    account_id: "acct",
  }) as unknown as Transaction;

const info = (bill: Bill, txs: Transaction[]) =>
  deriveCycleInfo(toPayable("bill", bill), txs, TODAY);

describe("ADR-036 cycle state (Rent 2, $609 due)", () => {
  it("is UNPAID with no transactions", () => {
    expect(info(rent(), []).state).toBe("unpaid");
  });

  it("is PENDING after submitting $500", () => {
    const i = info(rent({ cycle_amount_due: 609 }), [tx(500, "pending", "t1")]);
    expect(i.state).toBe("pending");
    expect(i.pending?.id).toBe("t1");
  });

  it("is PARTIAL with $109 remaining after clearing $500", () => {
    const i = info(rent({ cycle_amount_due: 609, cycle_paid_to_date: 500 }), [
      tx(500, "cleared", "t1"),
    ]);
    expect(i.state).toBe("partial");
    expect(i.remaining).toBe(109);
  });

  it("is PENDING again after submitting the remaining $109", () => {
    const i = info(rent({ cycle_amount_due: 609, cycle_paid_to_date: 500 }), [
      tx(500, "cleared", "t1"),
      tx(109, "pending", "t2"),
    ]);
    expect(i.state).toBe("pending");
  });

  it("is CLEARED once the resolved cycle rolled the due date forward", () => {
    // Clearing t2 resolves the cycle: due date advances, counters reset.
    const i = info(
      rent({ next_due_date: "2026-09-15", cycle_amount_due: null, cycle_paid_to_date: 0 }),
      [tx(500, "cleared", "t1"), tx(109, "cleared", "t2")],
    );
    expect(i.state).toBe("cleared");
    expect(i.remaining).toBe(0);
    expect(i.resolved).toBe(true);
    // Reset must delete BOTH transactions of the resolved cycle.
    expect(i.transactions.map((t) => t.id).sort()).toEqual(["t1", "t2"]);
    expect(i.clearedSum).toBe(609);
  });

  it("returns to UNPAID after the reset removes the cycle's transactions", () => {
    expect(info(rent(), []).state).toBe("unpaid");
  });
});
