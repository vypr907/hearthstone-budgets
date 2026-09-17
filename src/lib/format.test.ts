import { describe, expect, it } from "vitest";
import {
  addDaysISO,
  monthlyEquivalent,
  needsEnvelope,
  priorSetAsideThisMonth,
  shiftDate,
} from "./format";

type TxLike = Parameters<typeof priorSetAsideThisMonth>[0][number];

const tx = (over: Partial<TxLike> = {}): TxLike => ({
  linked_goal_id: "g1",
  description: "Set aside: Car Insurance -> Car Insurance envelope",
  transaction_date: "2026-08-04",
  amount: 120,
  ...over,
});

describe("priorSetAsideThisMonth (ADR-038 addendum)", () => {
  const TODAY = "2026-08-26";

  it("returns null when there is no prior set-aside", () => {
    expect(priorSetAsideThisMonth([], "Car Insurance", "g1", TODAY)).toBeNull();
  });

  it("finds a matching credit leg from earlier this month", () => {
    expect(priorSetAsideThisMonth([tx()], "Car Insurance", "g1", TODAY)).toEqual({
      date: "2026-08-04",
      amount: 120,
    });
  });

  it("ignores a set-aside from a previous month", () => {
    expect(
      priorSetAsideThisMonth([tx({ transaction_date: "2026-07-30" })], "Car Insurance", "g1", TODAY),
    ).toBeNull();
  });

  it("ignores the debit leg (no linked_goal_id)", () => {
    expect(
      priorSetAsideThisMonth([tx({ linked_goal_id: null })], "Car Insurance", "g1", TODAY),
    ).toBeNull();
  });

  it("ignores a credit for a different envelope goal", () => {
    expect(priorSetAsideThisMonth([tx({ linked_goal_id: "g2" })], "Car Insurance", "g1", TODAY)).toBeNull();
  });

  it("ignores a set-aside for a different bill", () => {
    expect(priorSetAsideThisMonth([tx()], "Rent", "g1", TODAY)).toBeNull();
  });

  it("ignores an unrelated goal-linked transaction (manual +Add)", () => {
    expect(
      priorSetAsideThisMonth(
        [tx({ description: "Birthday money" })],
        "Car Insurance",
        "g1",
        TODAY,
      ),
    ).toBeNull();
  });

  it("reports the amount as an absolute value", () => {
    expect(
      priorSetAsideThisMonth([tx({ amount: -120 })], "Car Insurance", "g1", TODAY)?.amount,
    ).toBe(120);
  });
});

describe("addDaysISO (ADR-047 2026-09-10 — early paycheck splits)", () => {
  it("shifts a paycheck split back by a negative day_offset", () => {
    // Official pay date Friday 2026-09-11; split lands 2 days early.
    expect(addDaysISO("2026-09-11", -2)).toBe("2026-09-09");
    expect(addDaysISO("2026-09-11", -1)).toBe("2026-09-10");
  });

  it("shifts forward for a positive offset", () => {
    expect(addDaysISO("2026-09-11", 3)).toBe("2026-09-14");
  });

  it("returns the same date for a zero offset", () => {
    expect(addDaysISO("2026-09-11", 0)).toBe("2026-09-11");
  });

  it("crosses month and year boundaries", () => {
    expect(addDaysISO("2026-09-01", -1)).toBe("2026-08-31");
    expect(addDaysISO("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDaysISO("2026-02-28", 1)).toBe("2026-03-01"); // 2026 is not a leap year
  });

  it("ignores a time component on the input and truncates fractional days", () => {
    expect(addDaysISO("2026-09-11T00:00:00", -2)).toBe("2026-09-09");
    expect(addDaysISO("2026-09-11", -1.9)).toBe("2026-09-10");
  });
});

describe("semiannually billing cycle", () => {
  it("shiftDate advances/reverses by 6 calendar months", () => {
    expect(shiftDate("2026-03-15", "semiannually", 1)).toBe("2026-09-15");
    expect(shiftDate("2026-09-15", "semiannually", -1)).toBe("2026-03-15");
  });

  it("monthlyEquivalent divides the amount by 6", () => {
    expect(monthlyEquivalent({ amount: 60, billing_cycle: "semiannually" })).toBe(10);
  });

  it("needsEnvelope is true, same as quarterly/bimonthly/annually", () => {
    expect(needsEnvelope("semiannually")).toBe(true);
  });
});
