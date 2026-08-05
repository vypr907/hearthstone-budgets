import { useMemo } from "react";
import { CheckCircle2, Circle, Clock, PieChart } from "lucide-react";
import { useTransactions } from "./data-hooks";
import { reverseDate } from "./format";
import { billCycleDue, debtCycleDue, type Payable } from "./payments";
import type { Transaction } from "./supabase";

/** ADR-036: state is derived from the ledger, never from a tap counter. */
export type LedgerState = "unpaid" | "pending" | "partial" | "cleared";

export type CycleInfo = {
  state: LedgerState;
  /** Amount owed for the cycle: cycle_amount_due (bills) / minimum_payment (debts). */
  due: number;
  clearedSum: number;
  remaining: number;
  /** Every transaction tied to the cycle being displayed. */
  transactions: Transaction[];
  pending: Transaction | null;
  /** True when the cycle already rolled forward (due date advanced on clear). */
  resolved: boolean;
};

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

const day = (d: string | null | undefined) => (d ? d.slice(0, 10) : "");

/**
 * ADR-036 state machine, derived per bill/debt from the transactions ledger:
 *
 * UNPAID   no transactions in the current cycle
 * PENDING  the cycle has a transaction still marked 'pending'
 * PARTIAL  cleared transactions this cycle sum to less than the amount due
 * CLEARED  cleared transactions this cycle cover the amount due
 *
 * A cleared cycle has already rolled its due date forward (ADR-019/035), so the
 * payments that resolved it now sit in the *previous* window — that window is
 * still the cycle covering today, hence the `resolved` lookback below.
 */
export function deriveCycleInfo(
  p: Payable,
  transactions: Transaction[],
  today: string,
): CycleInfo {
  const monthStart = `${today.slice(0, 7)}-01`;
  {
    {
      const linked = transactions.filter((t) =>
        p.kind === "bill" ? t.linked_bill_id === p.id : t.linked_debt_id === p.id,
      );

      const due = p.kind === "bill" ? billCycleDue(p.bill!) : debtCycleDue(p.debt!);
      const cycleName =
        p.kind === "bill" ? p.bill?.billing_cycle : (p.debt?.billing_cycle ?? "monthly");
      const dueDate = day(
        p.kind === "bill" ? p.bill?.next_due_date : p.debt?.next_due_date,
      );
      const openStart = dueDate ? reverseDate(dueDate, cycleName) : monthStart;

      const between = (t: Transaction, start: string, end: string) => {
        const d = day(t.transaction_date);
        return !!d && d > start && d <= end;
      };

      let cycleTx = linked.filter((t) => between(t, openStart, today));
      let resolved = false;

      if (cycleTx.length === 0 && dueDate && today <= openStart) {
        // The cycle covering today may already have been resolved and rolled forward.
        const prevStart = reverseDate(openStart, cycleName);
        const prev = linked.filter((t) => between(t, prevStart, openStart));
        const clearedPrev = prev
          .filter((t) => t.status === "cleared")
          .reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);
        if (prev.length > 0 && due > 0 && clearedPrev + 0.005 >= due) {
          cycleTx = prev;
          resolved = true;
        }
      }

      const pending =
        cycleTx.filter((t) => t.status === "pending").sort((a, b) =>
          day(b.transaction_date).localeCompare(day(a.transaction_date)),
        )[0] ?? null;
      const clearedSum = cycleTx
        .filter((t) => t.status === "cleared")
        .reduce((s, t) => s + Math.abs(Number(t.amount ?? 0)), 0);

      let state: LedgerState = "unpaid";
      if (pending) state = "pending";
      else if (due > 0 && clearedSum + 0.005 >= due) state = "cleared";
      else if (clearedSum > 0) state = "partial";

      return {
        state,
        due,
        clearedSum,
        remaining: Math.max(0, due - clearedSum),
        transactions: cycleTx,
        pending,
        resolved,
      };
    }
  }
}

export function useCycleState() {
  const { data: transactions = [] } = useTransactions();
  return useMemo(() => {
    const today = todayISO();
    return (p: Payable) => deriveCycleInfo(p, transactions, today);
  }, [transactions]);
}

/** Convenience wrapper for callers that only need the state name. */
export function useLedgerState() {
  const infoOf = useCycleState();
  return useMemo(() => (p: Payable) => infoOf(p).state, [infoOf]);
}

/** Shared 4-state presentation: distinct icon + colour per ADR-036. */
export function stateVisual(state: LedgerState) {
  switch (state) {
    case "pending":
      return { Icon: Clock, className: "text-state-pending", label: "Pending" };
    case "partial":
      return { Icon: PieChart, className: "text-state-partial", label: "Partial" };
    case "cleared":
      return { Icon: CheckCircle2, className: "text-state-cleared", label: "Cleared" };
    default:
      return { Icon: Circle, className: "text-muted-foreground/60", label: "Unpaid" };
  }
}
