import type { Debt } from "./supabase";

export type StrategyKey = "avalanche" | "snowball" | "custom";

export type DebtPlanInput = {
  id: string;
  name: string;
  balance: number;
  /** Annual interest rate as a percentage, e.g. 18.99. */
  rate: number;
  minimum: number;
  priority: number;
  knownFinanceCharge: number | null;
};

export type DebtResult = {
  id: string;
  name: string;
  months: number;
  interest: number;
  /** True when the total-interest figure came from known_finance_charge. */
  usedKnownCharge: boolean;
};

export type ScenarioResult = {
  months: number;
  totalInterest: number;
  totalPaid: number;
  /** Interest saved compared with paying only the minimums. */
  saved: number;
  perDebt: DebtResult[];
  incomplete: boolean;
};

const MAX_MONTHS = 600;

/** Only debts with a remaining balance participate in the payoff projection. */
export function activeDebts(debts: Debt[]): DebtPlanInput[] {
  return debts
    .filter((d) => !d.date_paid_off && Number(d.remaining_balance ?? 0) > 0)
    .map((d, i) => ({
      id: d.id,
      name: d.name,
      balance: Number(d.remaining_balance ?? 0),
      rate: Number(d.interest_rate ?? 0),
      minimum: Number(d.minimum_payment ?? 0),
      priority: d.priority_order ?? 1000 + i,
      knownFinanceCharge:
        d.known_finance_charge == null ? null : Number(d.known_finance_charge),
    }));
}

function orderFor(strategy: StrategyKey, debts: DebtPlanInput[]): DebtPlanInput[] {
  const list = [...debts];
  if (strategy === "avalanche") list.sort((a, b) => b.rate - a.rate || a.balance - b.balance);
  else if (strategy === "snowball") list.sort((a, b) => a.balance - b.balance || b.rate - a.rate);
  else list.sort((a, b) => a.priority - b.priority || a.balance - b.balance);
  return list;
}

/**
 * Month-by-month simulation. Minimums are paid on every debt; any extra
 * (the user's extra payment plus minimums freed by paid-off debts) rolls onto
 * the highest-ranked remaining debt for the chosen strategy.
 */
export function simulate(
  debts: DebtPlanInput[],
  extraMonthly: number,
  strategy: StrategyKey,
): ScenarioResult {
  const order = orderFor(strategy, debts);
  const state = order.map((d) => ({
    ...d,
    remaining: d.balance + (d.knownFinanceCharge ?? 0),
    interest: 0,
    months: 0,
  }));
  const baseMinimums = state.reduce((s, d) => s + d.minimum, 0);
  let month = 0;

  while (state.some((d) => d.remaining > 0.005) && month < MAX_MONTHS) {
    month += 1;
    // Accrue interest first.
    for (const d of state) {
      if (d.remaining <= 0.005) continue;
      const monthly = (d.rate > 0 ? d.rate / 100 : 0) / 12;
      const charge = d.remaining * monthly;
      d.remaining += charge;
      d.interest += charge;
    }

    let pool = baseMinimums + Math.max(0, extraMonthly);
    // Minimums on each open debt.
    for (const d of state) {
      if (d.remaining <= 0.005) continue;
      const pay = Math.min(d.minimum, d.remaining, pool);
      d.remaining -= pay;
      pool -= pay;
      if (d.remaining <= 0.005) {
        d.remaining = 0;
        d.months = month;
      }
    }
    // Everything left over hits the target debt in strategy order.
    for (const d of state) {
      if (pool <= 0.005) break;
      if (d.remaining <= 0.005) continue;
      const pay = Math.min(d.remaining, pool);
      d.remaining -= pay;
      pool -= pay;
      if (d.remaining <= 0.005) {
        d.remaining = 0;
        d.months = month;
      }
    }
  }

  const perDebt: DebtResult[] = state.map((d) => ({
    id: d.id,
    name: d.name,
    months: d.months || month,
    // Real loan/lease paperwork beats our projection when we have the figure.
    interest: d.knownFinanceCharge != null ? d.knownFinanceCharge : d.interest,
    usedKnownCharge: d.knownFinanceCharge != null,
  }));

  const totalInterest = perDebt.reduce((s, d) => s + d.interest, 0);
  const principal = debts.reduce((s, d) => s + d.balance, 0);

  return {
    months: month,
    totalInterest,
    totalPaid: principal + totalInterest,
    saved: 0,
    perDebt,
    incomplete: month >= MAX_MONTHS,
  };
}

export type Comparison = Record<StrategyKey, ScenarioResult> & {
  minimumsOnly: ScenarioResult;
};

/** All three strategies plus the minimums-only baseline used for savings. */
export function compareStrategies(
  debts: DebtPlanInput[],
  extraMonthly: number,
): Comparison {
  const minimumsOnly = simulate(debts, 0, "avalanche");
  const build = (s: StrategyKey) => {
    const r = simulate(debts, extraMonthly, s);
    return { ...r, saved: minimumsOnly.totalInterest - r.totalInterest };
  };
  return {
    minimumsOnly,
    avalanche: build("avalanche"),
    snowball: build("snowball"),
    custom: build("custom"),
  };
}

export function formatMonths(m: number): string {
  if (!Number.isFinite(m) || m <= 0) return "—";
  const y = Math.floor(m / 12);
  const rem = m % 12;
  if (y === 0) return `${m} mo`;
  return rem === 0 ? `${y} yr` : `${y} yr ${rem} mo`;
}
