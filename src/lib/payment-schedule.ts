import type { DebtPlanInput, StrategyKey } from "./debt-payoff";

export type ScheduledPayment = {
  debtId: string;
  name: string;
  amount: number;
  /** Balance left on this debt after the month's payment. */
  remaining: number;
  /** True when this payment clears the debt. */
  payoff: boolean;
};

export type ScheduleMonth = {
  /** YYYY-MM */
  month: string;
  label: string;
  total: number;
  payments: ScheduledPayment[];
};

function orderFor(strategy: StrategyKey, debts: DebtPlanInput[]): DebtPlanInput[] {
  const list = [...debts];
  if (strategy === "avalanche") list.sort((a, b) => b.rate - a.rate || a.balance - b.balance);
  else if (strategy === "snowball") list.sort((a, b) => a.balance - b.balance || b.rate - a.rate);
  else list.sort((a, b) => a.priority - b.priority || a.balance - b.balance);
  return list;
}

export function monthKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function labelOf(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

/**
 * Month-by-month payment plan for the next `months` months using the same
 * rules as the payoff simulation: minimums on every open debt, and all extra
 * (user extra + freed minimums) rolled onto the top-ranked remaining debt.
 */
export function buildSchedule(
  debts: DebtPlanInput[],
  extraMonthly: number,
  strategy: StrategyKey,
  months = 12,
  start: Date = new Date(),
): ScheduleMonth[] {
  const order = orderFor(strategy, debts);
  const state = order.map((d) => ({
    ...d,
    remaining: d.balance + (d.knownFinanceCharge ?? 0),
  }));
  const baseMinimums = state.reduce((s, d) => s + d.minimum, 0);
  const out: ScheduleMonth[] = [];

  for (let i = 0; i < months; i++) {
    const date = new Date(start.getFullYear(), start.getMonth() + i, 1);
    const paid = new Map<string, number>();

    for (const d of state) {
      if (d.remaining <= 0.005) continue;
      if (d.knownFinanceCharge != null) continue;
      const monthly = (d.rate > 0 ? d.rate / 100 : 0) / 12;
      d.remaining += d.remaining * monthly;
    }

    let pool = baseMinimums + Math.max(0, extraMonthly);
    for (const d of state) {
      if (d.remaining <= 0.005 || pool <= 0.005) continue;
      const pay = Math.min(d.minimum, d.remaining, pool);
      d.remaining -= pay;
      pool -= pay;
      paid.set(d.id, (paid.get(d.id) ?? 0) + pay);
      if (d.remaining <= 0.005) d.remaining = 0;
    }
    for (const d of state) {
      if (pool <= 0.005) break;
      if (d.remaining <= 0.005) continue;
      const pay = Math.min(d.remaining, pool);
      d.remaining -= pay;
      pool -= pay;
      paid.set(d.id, (paid.get(d.id) ?? 0) + pay);
      if (d.remaining <= 0.005) d.remaining = 0;
    }

    const payments: ScheduledPayment[] = state
      .filter((d) => (paid.get(d.id) ?? 0) > 0.005)
      .map((d) => ({
        debtId: d.id,
        name: d.name,
        amount: paid.get(d.id) ?? 0,
        remaining: d.remaining,
        payoff: d.remaining <= 0.005,
      }));

    out.push({
      month: monthKeyOf(date),
      label: labelOf(date),
      total: payments.reduce((s, p) => s + p.amount, 0),
      payments,
    });
  }

  return out;
}
