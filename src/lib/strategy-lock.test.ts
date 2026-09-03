import { describe, expect, it } from "vitest";
import type { Debt, DebtStrategySettings } from "@/lib/supabase";
import {
  applyLockedOrder,
  baselineComparison,
  comparisonLabel,
  computeBaseline,
  debtFreeDateFrom,
  isStrategyLocked,
  lockedInputs,
  monthsBetween,
} from "@/lib/strategy-lock";
import { activeDebts } from "@/lib/debt-payoff";

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

const FROM = new Date(2026, 0, 1); // 2026-01-01, local

function lockedSettings(over: Partial<DebtStrategySettings>): DebtStrategySettings {
  return {
    household_id: "h1",
    active_strategy: "avalanche",
    extra_monthly_payment: 0,
    strategy_locked_at: "2026-01-01T00:00:00Z",
    locked_strategy: "avalanche",
    locked_extra_monthly_payment: 0,
    locked_priority_order: null,
    baseline_debt_free_date: null,
    baseline_total_interest: null,
    ...over,
  };
}

describe("date helpers", () => {
  it("debtFreeDateFrom advances whole months and rolls the year", () => {
    expect(debtFreeDateFrom(0, FROM)).toBe("2026-01-01");
    expect(debtFreeDateFrom(5, FROM)).toBe("2026-06-01");
    expect(debtFreeDateFrom(14, FROM)).toBe("2027-03-01");
  });

  it("monthsBetween counts signed whole months", () => {
    expect(monthsBetween("2026-01-01", "2026-06-01")).toBe(5);
    expect(monthsBetween("2026-06-01", "2026-01-01")).toBe(-5);
    expect(monthsBetween("2026-01-01", "2027-03-01")).toBe(14);
  });
});

describe("lock state", () => {
  it("isStrategyLocked / lockedInputs are null-safe and unlocked by default", () => {
    expect(isStrategyLocked(null)).toBe(false);
    expect(
      isStrategyLocked({
        household_id: "h1",
        active_strategy: "snowball",
        extra_monthly_payment: 0,
      }),
    ).toBe(false);
    expect(lockedInputs(null)).toBeNull();
  });

  it("lockedInputs reads the frozen strategy, extra and order", () => {
    const s = lockedSettings({
      locked_strategy: "custom",
      locked_extra_monthly_payment: 250,
      locked_priority_order: ["b", "a"],
    });
    expect(lockedInputs(s)).toEqual({ strategy: "custom", extra: 250, order: ["b", "a"] });
  });
});

describe("applyLockedOrder", () => {
  it("re-ranks the plan by the frozen id list", () => {
    const plan = activeDebts([
      mkDebt({ id: "a", remaining_balance: 1000, minimum_payment: 50, priority_order: 1 }),
      mkDebt({ id: "b", remaining_balance: 2000, minimum_payment: 50, priority_order: 2 }),
    ]);
    const reordered = applyLockedOrder(plan, ["b", "a"]);
    expect(reordered.find((d) => d.id === "b")!.priority).toBe(0);
    expect(reordered.find((d) => d.id === "a")!.priority).toBe(1);
  });

  it("is a no-op for an empty / null order", () => {
    const plan = activeDebts([mkDebt({ id: "a", remaining_balance: 1000, minimum_payment: 50 })]);
    expect(applyLockedOrder(plan, null)).toBe(plan);
    expect(applyLockedOrder(plan, [])).toBe(plan);
  });
});

describe("computeBaseline", () => {
  it("returns a debt-free date and interest for a payable plan", () => {
    const debts = [
      mkDebt({ id: "a", remaining_balance: 1000, minimum_payment: 200, interest_rate: 0 }),
    ];
    const base = computeBaseline(debts, { strategy: "avalanche", extra: 0, order: null }, FROM);
    expect(base).not.toBeNull();
    // 1000 / 200 = 5 monthly payments, no interest.
    expect(base!.baseline_debt_free_date).toBe("2026-06-01");
    expect(base!.baseline_total_interest).toBe(0);
  });

  it("returns null when there is nothing to pay off", () => {
    const base = computeBaseline([], { strategy: "avalanche", extra: 0, order: null }, FROM);
    expect(base).toBeNull();
  });
});

describe("baselineComparison", () => {
  const debts = [
    mkDebt({ id: "a", remaining_balance: 1000, minimum_payment: 200, interest_rate: 0 }),
  ];
  const base = computeBaseline(debts, { strategy: "avalanche", extra: 0, order: null }, FROM)!;
  const settings = lockedSettings({
    baseline_debt_free_date: base.baseline_debt_free_date,
    baseline_total_interest: base.baseline_total_interest,
  });

  it("is null when the plan is unlocked", () => {
    expect(
      baselineComparison(
        { household_id: "h1", active_strategy: "avalanche", extra_monthly_payment: 0 },
        debts,
      ),
    ).toBeNull();
  });

  it("reads on_track when nothing has moved since the lock", () => {
    const c = baselineComparison(settings, debts, FROM)!;
    expect(c.status).toBe("on_track");
    expect(c.monthsDelta).toBe(0);
  });

  it("reads ahead when balances are lower than at lock time", () => {
    const paidDown = [
      mkDebt({ id: "a", remaining_balance: 400, minimum_payment: 200, interest_rate: 0 }),
    ];
    const c = baselineComparison(settings, paidDown, FROM)!;
    expect(c.status).toBe("ahead");
    expect(c.monthsDelta).toBeGreaterThan(0);
  });

  it("reads behind when balances are higher than at lock time", () => {
    const grown = [
      mkDebt({ id: "a", remaining_balance: 3000, minimum_payment: 200, interest_rate: 0 }),
    ];
    const c = baselineComparison(settings, grown, FROM)!;
    expect(c.status).toBe("behind");
    expect(c.monthsDelta).toBeLessThan(0);
  });

  it("reads ahead with everything paid off", () => {
    const c = baselineComparison(settings, [], FROM)!;
    expect(c.status).toBe("ahead");
    expect(c.liveInterest).toBe(0);
  });
});

describe("comparisonLabel", () => {
  it("phrases each status", () => {
    expect(comparisonLabel({ status: "on_track", monthsDelta: 0 } as never)).toBe("On track");
    expect(comparisonLabel({ status: "ahead", monthsDelta: 2 } as never)).toBe("2 mo ahead");
    expect(comparisonLabel({ status: "behind", monthsDelta: -1 } as never)).toBe("1 mo behind");
    expect(comparisonLabel({ status: "unknown", monthsDelta: 0 } as never)).toBe("Can't project");
  });
});
