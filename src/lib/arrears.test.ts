import { describe, expect, it } from "vitest";
import { computeArrears } from "./arrears";
import { toPayable } from "./payments";
import type { Bill, Debt } from "./supabase";

const bill = (over: Partial<Bill>): Bill =>
  ({
    id: "b1",
    household_id: "h",
    name: "Power",
    amount: 100,
    billing_cycle: "monthly",
    next_due_date: "2026-01-10",
    cycle_paid_to_date: 0,
    ...over,
  }) as Bill;

const debt = (over: Partial<Debt>): Debt =>
  ({
    id: "d1",
    household_id: "h",
    name: "Invoice",
    minimum_payment: 50,
    remaining_balance: 500,
    billing_cycle: "one_time",
    next_due_date: "2026-01-10",
    ...over,
  }) as Debt;

describe("computeArrears", () => {
  it("is zero when the due date hasn't passed", () => {
    const a = computeArrears(toPayable("bill", bill({})), "2026-01-05");
    expect(a.amountOverdue).toBe(0);
    expect(a.cyclesMissed).toBe(0);
  });

  it("counts each missed monthly cycle", () => {
    const a = computeArrears(toPayable("bill", bill({})), "2026-03-15");
    expect(a.cyclesMissed).toBe(3); // Jan, Feb, Mar
    expect(a.amountOverdue).toBe(300);
    expect(a.oldestMissedDate).toBe("2026-01-10");
  });

  it("nets partial payment off the current cycle only", () => {
    const a = computeArrears(
      toPayable("bill", bill({ cycle_paid_to_date: 40 })),
      "2026-02-15",
    );
    expect(a.amountOverdue).toBe(160); // 60 remaining + 100
  });

  it("adds opening arrears and ignores cycles on or before the as-of date", () => {
    const a = computeArrears(
      toPayable("bill", bill({ opening_arrears: 250, arrears_as_of: "2026-01-31" })),
      "2026-02-15",
    );
    expect(a.cyclesMissed).toBe(1); // Jan skipped by as-of
    expect(a.amountOverdue).toBe(350);
  });

  it("never rolls a one-time invoice past its single due date", () => {
    const a = computeArrears(toPayable("debt", debt({})), "2026-06-01");
    expect(a.cyclesMissed).toBe(1);
    expect(a.amountOverdue).toBe(50);
  });

  it("reports nothing but carry-in for a paid-off debt", () => {
    const a = computeArrears(
      toPayable("debt", debt({ remaining_balance: 0 })),
      "2026-06-01",
    );
    expect(a.amountOverdue).toBe(0);
  });
});
