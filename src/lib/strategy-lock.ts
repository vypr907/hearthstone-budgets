import {
  activeDebts,
  simulate,
  strategyKeyOf,
  type DebtPlanInput,
  type StrategyKey,
} from "./debt-payoff";
import type { Debt, DebtStrategySettings } from "./supabase";

/**
 * ADR-095: strategy lock + baseline snapshot.
 *
 * A locked plan freezes the three payoff inputs (strategy, extra monthly
 * payment, custom order) and stores two baseline scalars — the projected
 * debt-free month and total interest, taken from one `simulate()` run at lock
 * time. Every projection consumer then recomputes live from the *locked*
 * inputs against *current* balances and compares to the baseline, producing an
 * ahead / behind / on-track scoreboard. The baseline scalars are display only
 * and are never read back into engine math (the deliberate ADR-015 exception).
 */

export type LockedInputs = {
  strategy: StrategyKey;
  extra: number;
  /** Frozen Custom order as a list of debt ids, or null when never set. */
  order: string[] | null;
};

export function isStrategyLocked(s: DebtStrategySettings | null | undefined): boolean {
  return !!s?.strategy_locked_at;
}

/** The frozen inputs to project with, or null when the plan is unlocked. */
export function lockedInputs(s: DebtStrategySettings | null | undefined): LockedInputs | null {
  if (!isStrategyLocked(s)) return null;
  return {
    strategy: strategyKeyOf(s!.locked_strategy),
    extra: Number(s!.locked_extra_monthly_payment ?? 0),
    order: Array.isArray(s!.locked_priority_order) ? s!.locked_priority_order : null,
  };
}

/** First-of-month ISO date (`YYYY-MM-01`) `months` months after `from`. */
export function debtFreeDateFrom(months: number, from: Date = new Date()): string {
  const n = Number.isFinite(months) ? Math.max(0, Math.round(months)) : 0;
  const d = new Date(from.getFullYear(), from.getMonth() + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/** Whole months from ISO date `a` to ISO date `b` (b − a). */
export function monthsBetween(a: string, b: string): number {
  const [ay, am] = a.slice(0, 7).split("-").map(Number);
  const [by, bm] = b.slice(0, 7).split("-").map(Number);
  return (by - ay) * 12 + (bm - am);
}

/** "September 2028" from any ISO date string. */
export function formatMonthYear(iso: string | null | undefined): string {
  if (!iso) return "—";
  const [y, m] = iso.slice(0, 7).split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/**
 * Re-rank the plan by a frozen Custom order (array of debt ids). Debts missing
 * from the array keep their existing `priority` and sort after the frozen ones.
 * A no-op for avalanche / snowball, which order by rate / balance.
 */
export function applyLockedOrder(plan: DebtPlanInput[], order: string[] | null): DebtPlanInput[] {
  if (!order || order.length === 0) return plan;
  const idx = new Map(order.map((id, i) => [id, i]));
  return plan.map((d) => (idx.has(d.id) ? { ...d, priority: idx.get(d.id)! } : d));
}

export type BaselineSnapshot = {
  baseline_debt_free_date: string;
  baseline_total_interest: number;
};

/**
 * Run the sim once with `inputs` against current balances and return the two
 * baseline scalars to store at lock time. `null` when there is nothing to pay
 * off or the sim can't converge (600-month cap).
 */
export function computeBaseline(
  debts: Debt[],
  inputs: LockedInputs,
  from: Date = new Date(),
): BaselineSnapshot | null {
  const plan = applyLockedOrder(activeDebts(debts), inputs.order);
  if (plan.length === 0) return null;
  const r = simulate(plan, inputs.extra, inputs.strategy);
  if (r.incomplete) return null;
  return {
    baseline_debt_free_date: debtFreeDateFrom(r.months, from),
    baseline_total_interest: Math.round(r.totalInterest * 100) / 100,
  };
}

export type BaselineComparison = {
  status: "on_track" | "ahead" | "behind" | "unknown";
  /** Whole months the live projection is ahead (+) or behind (−) the baseline. */
  monthsDelta: number;
  /** Live − baseline interest; negative = less interest than the locked plan. */
  interestDelta: number;
  baselineDate: string;
  liveDate: string | null;
  baselineInterest: number;
  liveInterest: number | null;
};

/**
 * The locked-baseline scoreboard, or null when the plan is unlocked / has no
 * stored baseline. `status: "unknown"` when the live sim can't converge.
 */
export function baselineComparison(
  settings: DebtStrategySettings | null | undefined,
  debts: Debt[],
  from: Date = new Date(),
): BaselineComparison | null {
  const inputs = lockedInputs(settings);
  const baseDate = settings?.baseline_debt_free_date ?? null;
  if (!inputs || !baseDate) return null;
  const baseInterest = Number(settings?.baseline_total_interest ?? 0);

  const plan = applyLockedOrder(activeDebts(debts), inputs.order);

  // Everything paid off — unambiguously ahead of any remaining-balance baseline.
  if (plan.length === 0) {
    const liveDate = debtFreeDateFrom(0, from);
    return {
      status: "ahead",
      monthsDelta: Math.max(0, monthsBetween(liveDate, baseDate)),
      interestDelta: -baseInterest,
      baselineDate: baseDate,
      liveDate,
      baselineInterest: baseInterest,
      liveInterest: 0,
    };
  }

  const live = simulate(plan, inputs.extra, inputs.strategy);
  if (live.incomplete) {
    return {
      status: "unknown",
      monthsDelta: 0,
      interestDelta: 0,
      baselineDate: baseDate,
      liveDate: null,
      baselineInterest: baseInterest,
      liveInterest: null,
    };
  }

  const liveDate = debtFreeDateFrom(live.months, from);
  const monthsDelta = monthsBetween(liveDate, baseDate); // baseline − live: + = earlier = ahead
  const interestDelta = Math.round((live.totalInterest - baseInterest) * 100) / 100;
  return {
    status: monthsDelta > 0 ? "ahead" : monthsDelta < 0 ? "behind" : "on_track",
    monthsDelta,
    interestDelta,
    baselineDate: baseDate,
    liveDate,
    baselineInterest: baseInterest,
    liveInterest: Math.round(live.totalInterest * 100) / 100,
  };
}

/** Short scoreboard label, e.g. "On track", "2 mo ahead", "1 mo behind". */
export function comparisonLabel(c: BaselineComparison): string {
  if (c.status === "unknown") return "Can't project";
  if (c.status === "on_track") return "On track";
  const n = Math.abs(c.monthsDelta);
  return `${n} mo ${c.status === "ahead" ? "ahead" : "behind"}`;
}
