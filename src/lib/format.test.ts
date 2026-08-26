import { describe, expect, it } from "vitest";
import { priorSetAsideThisMonth } from "./format";

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
