import { describe, expect, it } from "vitest";
import type { Debt } from "@/lib/supabase";
import { hasRecommendation, recommendedPaymentsThisCycle } from "@/lib/debt-recommended";

let seq = 0;
function mkDebt(partial: Partial<Debt>): Debt {
  seq += 1;
  return {
    id: partial.id ?? `d${seq}`,
    household_id: "h1",
    name: partial.name ?? `Debt ${seq}`,
    category_id: null,
    debt_type: null,
    institution_id: null,
    starting_balance: null,
    program_start_balance: null,
    remaining_balance: 0,
    minimum_payment: 0,
    interest_rate: 0,
    known_finance_charge: null,
    due_day: null,
    next_due_date: null,
    billing_cycle: "monthly",
    payment_status: null,
    on_payment_plan: null,
    paid_with: null,
    manual_or_auto: null,
    priority_order: null,
    notes: null,
    date_paid_off: null,
    created_at: "2026-01-01",
    updated_at: "2026-01-01",
    ...partial,
  } as Debt;
}

const AVALANCHE = { active_strategy: "avalanche", extra_monthly_payment: 0 };

describe("recommendedPaymentsThisCycle", () => {
  it("recommends nothing when no rollover lands anywhere (extra 0, nothing clears)", () => {
    const debts = [
      mkDebt({
        id: "a",
        remaining_balance: 5000,
        minimum_payment: 100,
        interest_rate: 20,
        priority_order: 1,
      }),
      mkDebt({
        id: "b",
        remaining_balance: 5000,
        minimum_payment: 100,
        interest_rate: 10,
        priority_order: 2,
      }),
    ];
    const rec = recommendedPaymentsThisCycle(debts, AVALANCHE);
    expect(hasRecommendation(rec.get("a"))).toBe(false);
    expect(hasRecommendation(rec.get("b"))).toBe(false);
    expect(rec.get("a")!.monthlyTarget).toBeCloseTo(100, 5);
  });

  it("routes the extra payment to the top-ranked debt (avalanche)", () => {
    const debts = [
      mkDebt({
        id: "hi",
        remaining_balance: 5000,
        minimum_payment: 100,
        interest_rate: 25,
        priority_order: 2,
      }),
      mkDebt({
        id: "lo",
        remaining_balance: 5000,
        minimum_payment: 100,
        interest_rate: 5,
        priority_order: 1,
      }),
    ];
    const rec = recommendedPaymentsThisCycle(debts, {
      active_strategy: "avalanche",
      extra_monthly_payment: 300,
    });
    expect(rec.get("hi")!.monthlyTarget).toBeCloseTo(400, 5); // 100 min + 300 extra
    expect(rec.get("hi")!.rollover).toBeCloseTo(300, 5);
    expect(hasRecommendation(rec.get("hi"))).toBe(true);
    expect(hasRecommendation(rec.get("lo"))).toBe(false);
  });

  it("routes the extra to a different debt under snowball vs avalanche", () => {
    const debts = [
      mkDebt({ id: "big-rate", remaining_balance: 8000, minimum_payment: 100, interest_rate: 30 }),
      mkDebt({ id: "small-bal", remaining_balance: 1000, minimum_payment: 100, interest_rate: 5 }),
    ];
    const av = recommendedPaymentsThisCycle(debts, {
      active_strategy: "avalanche",
      extra_monthly_payment: 200,
    });
    const sn = recommendedPaymentsThisCycle(debts, {
      active_strategy: "snowball",
      extra_monthly_payment: 200,
    });
    expect(hasRecommendation(av.get("big-rate"))).toBe(true);
    expect(hasRecommendation(sn.get("small-bal"))).toBe(true);
  });

  it("never includes advance-type debts", () => {
    const debts = [
      mkDebt({ id: "adv", debt_type: "advance", remaining_balance: 500, minimum_payment: 500 }),
      mkDebt({ id: "real", remaining_balance: 2000, minimum_payment: 100 }),
    ];
    const rec = recommendedPaymentsThisCycle(debts, {
      active_strategy: "avalanche",
      extra_monthly_payment: 300,
    });
    expect(rec.has("adv")).toBe(false);
    expect(rec.has("real")).toBe(true);
  });

  it("reports the monthly-equivalent minimum for a biweekly debt", () => {
    const debts = [
      mkDebt({
        id: "bw",
        billing_cycle: "biweekly",
        remaining_balance: 5000,
        minimum_payment: 150,
        priority_order: 1,
      }),
    ];
    const rec = recommendedPaymentsThisCycle(debts, {
      active_strategy: "avalanche",
      extra_monthly_payment: 100,
    });
    expect(rec.get("bw")!.monthlyMinimum).toBeCloseTo(300, 5); // 150 * 2
    expect(rec.get("bw")!.monthlyTarget).toBeCloseTo(400, 5); // 300 + 100
  });

  it("does not throw when settings is null", () => {
    const debts = [mkDebt({ remaining_balance: 1000, minimum_payment: 100 })];
    expect(() => recommendedPaymentsThisCycle(debts, null)).not.toThrow();
  });
});
