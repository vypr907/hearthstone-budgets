import { useMemo } from "react";
import { activeDebts, strategyKeyOf } from "./debt-payoff";
import { useDebts, useDebtStrategySettings } from "./data-hooks";
import { buildSchedule } from "./payment-schedule";
import { applyLockedOrder, lockedInputs } from "./strategy-lock";
import type { Debt, DebtStrategySettings } from "./supabase";

/**
 * ADR-094: what the active payoff strategy says to pay on a debt THIS calendar
 * month — its monthly-equivalent minimum plus any snowball rollover that lands
 * on it. Purely a display projection (ADR-015/060): derived from the schedule
 * engine, never stored, recomputed on demand.
 */
export type RecommendedPayment = {
  /** Engine target for this calendar month: monthly minimum + rollover. */
  monthlyTarget: number;
  /** The debt's monthly-equivalent minimum (same basis as `monthlyTarget`). */
  monthlyMinimum: number;
  /** `monthlyTarget − monthlyMinimum`; > 0 only when rollover is aimed here. */
  rollover: number;
};

const EPSILON = 0.01;

type StrategySettings = Partial<DebtStrategySettings> | null | undefined;

export function recommendedPaymentsThisCycle(
  debts: Debt[],
  settings: StrategySettings,
  start: Date = new Date(),
): Map<string, RecommendedPayment> {
  // ADR-095: a locked plan projects from the frozen inputs, not the live ones.
  const locked = lockedInputs(settings as DebtStrategySettings | null | undefined);
  const strategy = locked ? locked.strategy : strategyKeyOf(settings?.active_strategy);
  const extra = locked ? locked.extra : Number(settings?.extra_monthly_payment ?? 0);
  const plan = locked ? applyLockedOrder(activeDebts(debts), locked.order) : activeDebts(debts);
  const month0 = buildSchedule(plan, extra, strategy, 1, start)[0];

  const out = new Map<string, RecommendedPayment>();
  for (const d of plan) {
    const target = month0?.payments.find((p) => p.debtId === d.id)?.amount ?? 0;
    out.set(d.id, {
      monthlyTarget: target,
      monthlyMinimum: d.minimum,
      rollover: Math.max(0, target - d.minimum),
    });
  }
  return out;
}

/** True when the strategy wants more than the minimum on this debt. */
export function hasRecommendation(r: RecommendedPayment | undefined): boolean {
  return !!r && r.rollover > EPSILON;
}

/** Household-wide recommended payments for the current calendar month. */
export function useRecommendedPayments(): Map<string, RecommendedPayment> {
  const { data: debts = [] } = useDebts();
  const { data: settings } = useDebtStrategySettings();
  return useMemo(() => recommendedPaymentsThisCycle(debts, settings), [debts, settings]);
}
