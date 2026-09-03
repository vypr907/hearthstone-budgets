import { describe, expect, it } from "vitest";
import {
  advanceMinimumPaymentPatch,
  advanceReactivationPatch,
  isAdvanceDisbursement,
  isPreAdvanceHistoricalPayment,
  rebuiltCycleAmountDue,
} from "./payments";
import type { Bill, BillAdjustment, Debt, Transaction } from "./supabase";
import { debtPayoffDatePatch } from "./debt-payoff-state";

const debt = (over: Partial<Debt> = {}): Debt =>
  ({
    id: "d1",
    household_id: "h",
    name: "OnePay Advance",
    debt_type: "advance",
    billing_cycle: "biweekly",
    remaining_balance: 0,
    minimum_payment: 0,
    cycle_paid_to_date: 40,
    payment_status: "cleared",
    date_paid_off: "2026-08-10",
    ...over,
  }) as Debt;

describe("advanceMinimumPaymentPatch", () => {
  it("mirrors minimum_payment to the new balance for advance-type debts", () => {
    expect(advanceMinimumPaymentPatch(debt(), 231.75)).toEqual({ minimum_payment: 231.75 });
  });

  it("is a no-op for every other debt type", () => {
    expect(advanceMinimumPaymentPatch(debt({ debt_type: "loan" }), 231.75)).toEqual({});
    expect(advanceMinimumPaymentPatch(debt({ debt_type: "credit card" }), 500)).toEqual({});
  });
});

describe("isPreAdvanceHistoricalPayment (ADR-084 addendum)", () => {
  // biweekly advance, current cycle window ≈ 2026-08-21 → 2026-09-04.
  const adv = debt({ next_due_date: "2026-09-04", date_paid_off: null });
  const TODAY = "2026-09-03";

  it("is true for an advance payment dated before both the cycle and the newest advance", () => {
    expect(isPreAdvanceHistoricalPayment(adv, "2026-07-17", "2026-08-28", TODAY)).toBe(true);
  });

  it("is false for a payment inside the current cycle", () => {
    expect(isPreAdvanceHistoricalPayment(adv, "2026-08-25", "2026-08-28", TODAY)).toBe(false);
  });

  it("is false for a historical payment dated after the newest advance", () => {
    expect(isPreAdvanceHistoricalPayment(adv, "2026-08-15", "2026-08-10", TODAY)).toBe(false);
  });

  it("is false for non-advance debts and when there is no advance date", () => {
    const loan = debt({ debt_type: "loan", next_due_date: "2026-09-04" });
    expect(isPreAdvanceHistoricalPayment(loan, "2026-07-17", "2026-08-28", TODAY)).toBe(false);
    expect(isPreAdvanceHistoricalPayment(adv, "2026-07-17", null, TODAY)).toBe(false);
  });
});

describe("isAdvanceDisbursement (ADR-056 addendum)", () => {
  const tx = (over: Partial<Transaction>): Transaction => ({ ...over }) as Transaction;

  it("is true for a linked positive 'Advance: …' row", () => {
    expect(
      isAdvanceDisbursement(tx({ linked_debt_id: "d1", amount: 40, description: "Advance: Cleo" })),
    ).toBe(true);
  });

  it("is false for a repayment, an unlinked leg, or a differently-described credit", () => {
    const repayment = tx({ linked_debt_id: "d1", amount: -40, description: "Debt payment · Cleo" });
    const unlinked = tx({ linked_debt_id: null, amount: 40, description: "Advance: Cleo" });
    const refund = tx({ linked_debt_id: "d1", amount: 40, description: "Refund" });
    expect(isAdvanceDisbursement(repayment)).toBe(false);
    expect(isAdvanceDisbursement(unlinked)).toBe(false);
    expect(isAdvanceDisbursement(refund)).toBe(false);
  });
});

describe("advanceReactivationPatch (ADR-066)", () => {
  it("resets payoff state so a re-advanced debt stops reading as cleared", () => {
    expect(advanceReactivationPatch(debt())).toEqual({
      date_paid_off: null,
      payment_status: "unpaid",
      cycle_paid_to_date: 0,
    });
  });

  it("is a no-op for an advance debt that was never paid off", () => {
    expect(advanceReactivationPatch(debt({ date_paid_off: null }))).toEqual({});
  });

  it("is a no-op for a paid-off debt that is not an advance", () => {
    expect(advanceReactivationPatch(debt({ debt_type: "loan" }))).toEqual({});
  });
});

describe("debtPayoffDatePatch (ADR-066 addendum)", () => {
  it("sets the supplied effective date at the zero-balance threshold", () => {
    expect(
      debtPayoffDatePatch(debt({ debt_type: "invoice", date_paid_off: null }), 0.005, "2026-06-03"),
    ).toEqual({ date_paid_off: "2026-06-03" });
  });

  it("preserves an existing payoff date", () => {
    expect(debtPayoffDatePatch(debt({ debt_type: "loan" }), 0, "2026-09-01")).toEqual({
      date_paid_off: "2026-08-10",
    });
  });

  it("clears the payoff date when a non-Advance debt is reopened", () => {
    expect(debtPayoffDatePatch(debt({ debt_type: "loan" }), 0.006)).toEqual({
      date_paid_off: null,
    });
  });

  it("does not manage the reusable Advance lifecycle", () => {
    expect(debtPayoffDatePatch(debt(), 0, "2026-09-01")).toEqual({});
  });
});

const bill = (over: Partial<Bill> = {}): Bill =>
  ({
    id: "b1",
    household_id: "h",
    name: "Beiers",
    amount: 100,
    billing_cycle: "monthly",
    next_due_date: "2026-08-01",
    is_variable_amount: false,
    ...over,
  }) as Bill;

const adj = (over: Partial<BillAdjustment> = {}): BillAdjustment =>
  ({
    id: "a1",
    household_id: "h",
    bill_id: "b1",
    amount: 50,
    adjustment_type: "correction",
    description: null,
    adjustment_date: "2026-08-05",
    affects_balance: true,
    ...over,
  }) as BillAdjustment;

describe("rebuiltCycleAmountDue (ADR-058 addendum)", () => {
  it("returns null for a bill with no adjustments — plain reset, unchanged", () => {
    expect(rebuiltCycleAmountDue(bill(), [], "2026-08-01")).toBeNull();
  });

  it("adds an active in-cycle adjustment back onto the bill's standing amount", () => {
    expect(rebuiltCycleAmountDue(bill(), [adj({ amount: 50 })], "2026-08-01")).toBe(150);
  });

  it("sums multiple in-cycle adjustments, keeping sign", () => {
    const adjustments = [
      adj({ id: "a1", amount: 50, adjustment_date: "2026-08-03" }),
      adj({ id: "a2", amount: -20, adjustment_date: "2026-08-20" }),
    ];
    expect(rebuiltCycleAmountDue(bill(), adjustments, "2026-08-01")).toBe(130);
  });

  it("ignores record-only (affects_balance = false) adjustments", () => {
    expect(
      rebuiltCycleAmountDue(bill(), [adj({ affects_balance: false })], "2026-08-01"),
    ).toBeNull();
  });

  it("ignores adjustments for a different bill", () => {
    expect(
      rebuiltCycleAmountDue(bill(), [adj({ bill_id: "other" })], "2026-08-01"),
    ).toBeNull();
  });

  it("ignores an adjustment dated in the previous cycle", () => {
    expect(
      rebuiltCycleAmountDue(bill(), [adj({ adjustment_date: "2026-06-25" })], "2026-08-01"),
    ).toBeNull();
  });

  it("ignores an adjustment dated in the next cycle", () => {
    expect(
      rebuiltCycleAmountDue(bill(), [adj({ adjustment_date: "2026-09-15" })], "2026-08-01"),
    ).toBeNull();
  });

  it("includes an adjustment dated after the due date but within this cycle", () => {
    expect(
      rebuiltCycleAmountDue(bill(), [adj({ adjustment_date: "2026-08-28", amount: 30 })], "2026-08-01"),
    ).toBe(130);
  });

  it("floors the rebuilt amount at 0", () => {
    expect(rebuiltCycleAmountDue(bill(), [adj({ amount: -500 })], "2026-08-01")).toBe(0);
  });

  it("returns null for a variable bill (cycle_amount_due is user-entered there)", () => {
    expect(
      rebuiltCycleAmountDue(bill({ is_variable_amount: true }), [adj()], "2026-08-01"),
    ).toBeNull();
  });

  it("returns null when there is no due date to anchor the cycle window", () => {
    expect(rebuiltCycleAmountDue(bill(), [adj()], null)).toBeNull();
  });

  it("works on a biweekly cycle's shorter window", () => {
    const b = bill({ billing_cycle: "biweekly", next_due_date: "2026-08-14" });
    // window is (2026-07-31, 2026-08-28]
    expect(
      rebuiltCycleAmountDue(b, [adj({ adjustment_date: "2026-08-10", amount: 25 })], "2026-08-14"),
    ).toBe(125);
    expect(
      rebuiltCycleAmountDue(b, [adj({ adjustment_date: "2026-07-20", amount: 25 })], "2026-08-14"),
    ).toBeNull();
  });
});
