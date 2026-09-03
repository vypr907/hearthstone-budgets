import { describe, expect, it } from "vitest";
import type { Debt } from "@/lib/supabase";
import {
  activeDebts,
  compareStrategies,
  orderFor,
  simulate,
  strategyKeyOf,
  type DebtPlanInput,
} from "@/lib/debt-payoff";
import { buildSchedule } from "@/lib/payment-schedule";

/**
 * ADR-015: the payoff engine is a client-side month-by-month simulation, never
 * stored. ADR-094: advances are excluded and non-monthly minimums are fed in as
 * their monthly equivalent.
 */

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

function plan(partial: Partial<DebtPlanInput>): DebtPlanInput {
  seq += 1;
  return {
    id: partial.id ?? `p${seq}`,
    name: partial.name ?? `P${seq}`,
    balance: 0,
    rate: 0,
    minimum: 0,
    priority: 0,
    knownFinanceCharge: null,
    ...partial,
  };
}

describe("strategyKeyOf", () => {
  it("normalizes stored strings and unknowns", () => {
    expect(strategyKeyOf("Snowball")).toBe("snowball");
    expect(strategyKeyOf("custom")).toBe("custom");
    expect(strategyKeyOf("Custom Priority")).toBe("avalanche"); // unknown -> default
    expect(strategyKeyOf(null)).toBe("avalanche");
    expect(strategyKeyOf(undefined)).toBe("avalanche");
    expect(strategyKeyOf("")).toBe("avalanche");
  });
});

describe("activeDebts", () => {
  it("excludes advance-type debts (case-insensitive)", () => {
    const out = activeDebts([
      mkDebt({ id: "keep", debt_type: "credit card", remaining_balance: 500 }),
      mkDebt({ id: "adv1", debt_type: "advance", remaining_balance: 600 }),
      mkDebt({ id: "adv2", debt_type: "Advance", remaining_balance: 100 }),
    ]);
    expect(out.map((d) => d.id)).toEqual(["keep"]);
  });

  it("excludes paid-off debts and zero/negative balances", () => {
    const out = activeDebts([
      mkDebt({ id: "open", remaining_balance: 100 }),
      mkDebt({ id: "paid", remaining_balance: 100, date_paid_off: "2026-02-01" }),
      mkDebt({ id: "zero", remaining_balance: 0 }),
      mkDebt({ id: "neg", remaining_balance: -5 }),
    ]);
    expect(out.map((d) => d.id)).toEqual(["open"]);
  });

  it("feeds minimum in as its monthly equivalent", () => {
    const [biweekly, quarterly, monthly, oneTime, customNoInterval] = activeDebts([
      mkDebt({ billing_cycle: "biweekly", minimum_payment: 100, remaining_balance: 1 }),
      mkDebt({ billing_cycle: "quarterly", minimum_payment: 300, remaining_balance: 1 }),
      mkDebt({ billing_cycle: "monthly", minimum_payment: 85, remaining_balance: 1 }),
      mkDebt({ billing_cycle: "one_time", minimum_payment: 500, remaining_balance: 1 }),
      mkDebt({
        billing_cycle: "custom",
        cycle_interval_days: null,
        minimum_payment: 40,
        remaining_balance: 1,
      }),
    ]);
    expect(biweekly.minimum).toBe(200);
    expect(quarterly.minimum).toBe(100);
    expect(monthly.minimum).toBe(85);
    expect(oneTime.minimum).toBe(500); // no monthly equivalent -> raw fallback
    expect(customNoInterval.minimum).toBe(40); // interval-less custom -> raw fallback
  });

  it("falls back to 1000 + index when priority_order is null", () => {
    const out = activeDebts([
      mkDebt({ remaining_balance: 1, priority_order: null }),
      mkDebt({ remaining_balance: 1, priority_order: 3 }),
      mkDebt({ remaining_balance: 1, priority_order: null }),
    ]);
    expect(out.map((d) => d.priority)).toEqual([1000, 3, 1002]);
  });
});

describe("orderFor", () => {
  const a = plan({ id: "a", balance: 300, rate: 10, priority: 2 });
  const b = plan({ id: "b", balance: 100, rate: 25, priority: 3 });
  const c = plan({ id: "c", balance: 100, rate: 5, priority: 1 });

  it("avalanche = highest rate first, tie broken by smallest balance", () => {
    expect(orderFor("avalanche", [a, b, c]).map((d) => d.id)).toEqual(["b", "a", "c"]);
  });
  it("snowball = smallest balance first, tie broken by highest rate", () => {
    expect(orderFor("snowball", [a, b, c]).map((d) => d.id)).toEqual(["b", "c", "a"]);
  });
  it("custom = ascending priority, tie broken by smallest balance", () => {
    expect(orderFor("custom", [a, b, c]).map((d) => d.id)).toEqual(["c", "a", "b"]);
  });
});

describe("simulate", () => {
  it("pays a single 0%-interest debt down by its minimum", () => {
    const r = simulate([plan({ balance: 1000, minimum: 100 })], 0, "avalanche");
    expect(r.months).toBe(10);
    expect(r.totalInterest).toBeCloseTo(0, 5);
    expect(r.incomplete).toBe(false);
  });

  it("rolls a paid-off debt's freed minimum onto the next debt", () => {
    const debts = [
      plan({ id: "small", balance: 100, minimum: 100, priority: 1 }),
      plan({ id: "big", balance: 1000, minimum: 100, priority: 2 }),
    ];
    const withRollover = simulate(debts, 0, "custom");
    const bigAlone = simulate([plan({ balance: 1000, minimum: 100 })], 0, "avalanche");
    // "small" clears month 1; its $100 then doubles the payment on "big".
    expect(withRollover.perDebt.find((d) => d.id === "big")!.months).toBeLessThan(bigAlone.months);
  });

  it("uses known_finance_charge verbatim and accrues no model interest", () => {
    const r = simulate(
      [plan({ balance: 1000, minimum: 100, rate: 35, knownFinanceCharge: 250 })],
      0,
      "avalanche",
    );
    const d = r.perDebt[0];
    expect(d.interest).toBe(250);
    expect(d.usedKnownCharge).toBe(true);
    expect(r.totalInterest).toBe(250);
  });

  it("flags an unpayable scenario as incomplete at the 600-month cap", () => {
    const r = simulate([plan({ balance: 100000, minimum: 10, rate: 99 })], 0, "avalanche");
    expect(r.incomplete).toBe(true);
    expect(r.months).toBe(600);
  });

  it("clamps a negative extra payment to zero", () => {
    const debts = [plan({ balance: 1000, minimum: 100 })];
    expect(simulate(debts, -500, "avalanche").months).toBe(simulate(debts, 0, "avalanche").months);
  });
});

describe("compareStrategies", () => {
  const debts = [
    plan({ id: "a", balance: 2000, rate: 25, minimum: 50, priority: 2 }),
    plan({ id: "b", balance: 500, rate: 5, minimum: 50, priority: 1 }),
  ];

  it("baseline is minimums-only avalanche and 'saved' is interest vs that baseline", () => {
    const cmp = compareStrategies(debts, 300);
    const baseline = simulate(debts, 0, "avalanche");
    expect(cmp.minimumsOnly.totalInterest).toBeCloseTo(baseline.totalInterest, 5);
    for (const key of ["avalanche", "snowball", "custom"] as const) {
      expect(cmp[key].saved).toBeCloseTo(
        cmp.minimumsOnly.totalInterest - cmp[key].totalInterest,
        5,
      );
      expect(cmp[key].saved).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("buildSchedule (shares orderFor + activeDebts basis)", () => {
  it("emits `months` entries starting at the start month", () => {
    const s = buildSchedule(
      [plan({ balance: 1000, minimum: 100 })],
      0,
      "avalanche",
      6,
      new Date(2026, 0, 1),
    );
    expect(s).toHaveLength(6);
    expect(s[0].month).toBe("2026-01");
  });

  it("month 0 spends the sum of minimums plus the extra while every debt is open", () => {
    const debts = [plan({ balance: 5000, minimum: 100 }), plan({ balance: 5000, minimum: 150 })];
    const s = buildSchedule(debts, 200, "avalanche", 1, new Date(2026, 0, 1));
    expect(s[0].total).toBeCloseTo(450, 5);
  });

  it("a biweekly debt's month-0 payment reflects the doubled minimum (via activeDebts)", () => {
    const [d] = activeDebts([
      mkDebt({ billing_cycle: "biweekly", minimum_payment: 100, remaining_balance: 5000 }),
    ]);
    const s = buildSchedule([d], 0, "avalanche", 1, new Date(2026, 0, 1));
    expect(s[0].payments[0].amount).toBeCloseTo(200, 5);
  });

  it("marks the clearing month with payoff and drops the debt afterwards", () => {
    const s = buildSchedule(
      [plan({ id: "x", balance: 200, minimum: 100 })],
      0,
      "avalanche",
      4,
      new Date(2026, 0, 1),
    );
    expect(s[1].payments.find((p) => p.debtId === "x")!.payoff).toBe(true);
    expect(s[2].payments.find((p) => p.debtId === "x")).toBeUndefined();
  });
});
