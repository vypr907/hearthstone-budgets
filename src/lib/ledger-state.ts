import { useMemo } from "react";
import { CheckCircle2, Circle, Clock, PieChart } from "lucide-react";
import { useTransactions } from "./data-hooks";
import { shiftDateSafe } from "./format";
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
      const cycleDays =
        p.kind === "bill" ? p.bill?.cycle_interval_days : p.debt?.cycle_interval_days;
      const openStart = dueDate ? shiftDateSafe(dueDate, cycleName, -1, cycleDays) : monthStart;

      const between = (t: Transaction, start: string, end: string) => {
        const d = day(t.transaction_date);
        return !!d && d > start && d <= end;
      };

      // ADR-048: a one-time charge (invoice) has no rolling window — every
      // linked payment belongs to its single, open cycle. Windowing it by
      // due-date left invoice payments outside the range, so the Everything
      // screen kept showing "unpaid" after a real payment.
      const oneTime = (cycleName ?? "").toLowerCase().replace(/[\s_-]/g, "") === "onetime";

      // A sufficient payment always rolls next_due_date forward immediately, so
      // if next_due_date is still `dueDate` and today is past it, nothing since
      // `dueDate` has resolved this cycle. Transactions between openStart and
      // dueDate belong to the already-resolved previous cycle and must not be
      // recounted — only a transaction dated on/after dueDate can be a genuine
      // (possibly late) payment toward the still-open current cycle.
      const pastDue = !!dueDate && today > dueDate;
      let cycleTx = oneTime
        ? linked
        : pastDue
          ? linked.filter((t) => {
              const d = day(t.transaction_date);
              return !!d && d >= dueDate! && d <= today;
            })
          : linked.filter((t) => between(t, openStart, today));
      let resolved = false;


      if (cycleTx.length === 0 && dueDate && today <= openStart) {
        // The cycle covering today may already have been resolved and rolled forward.
        const prevStart = shiftDateSafe(openStart, cycleName, -1, cycleDays);
        const prev = linked.filter((t) => between(t, prevStart, openStart));
        // ADR-008: net signed amounts rather than summing absolute values, so a
        // correcting/reversal transaction offsets the payment it reverses
        // instead of double-counting alongside it.
        const clearedPrev = Math.max(
          0,
          prev
            .filter((t) => t.status === "cleared")
            .reduce((s, t) => s - Number(t.amount ?? 0), 0),
        );
        if (prev.length > 0 && due > 0 && clearedPrev + 0.005 >= due) {
          cycleTx = prev;
          resolved = true;
        }
      }

      const pending =
        cycleTx.filter((t) => t.status === "pending").sort((a, b) =>
          day(b.transaction_date).localeCompare(day(a.transaction_date)),
        )[0] ?? null;
      // ADR-008: net signed amounts rather than summing absolute values, so a
      // correcting/reversal transaction offsets the payment it reverses
      // instead of double-counting alongside it.
      const clearedSum = Math.max(
        0,
        cycleTx
          .filter((t) => t.status === "cleared")
          .reduce((s, t) => s - Number(t.amount ?? 0), 0),
      );

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
