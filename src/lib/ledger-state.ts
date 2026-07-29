import { useMemo } from "react";
import { useTransactions } from "./data-hooks";
import { reverseDate } from "./format";
import type { Payable } from "./payments";

export type LedgerState = "unpaid" | "pending" | "cleared";

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * Derive an item's state from the ledger rather than from payment_status.
 * A cleared bill is rolled forward to 'unpaid' by payments.ts, so the row's
 * own status can't tell you whether this cycle was already paid.
 *
 * Bill  → cleared tx dated within the current cycle
 *         (next_due_date minus one billing_cycle interval .. today]
 * Debt  → cleared tx dated within the current calendar month
 * Either → a pending tx means 'pending'
 */
export function useLedgerState() {
  const { data: transactions = [] } = useTransactions();

  return useMemo(() => {
    const today = todayISO();
    const monthStart = `${today.slice(0, 7)}-01`;

    return function stateOf(p: Payable): LedgerState {
      const linked = transactions.filter((t) =>
        p.kind === "bill" ? t.linked_bill_id === p.id : t.linked_debt_id === p.id,
      );

      const cycleStart =
        p.kind === "bill"
          ? p.bill?.next_due_date
            ? reverseDate(p.bill.next_due_date.slice(0, 10), p.bill.billing_cycle)
            : monthStart
          : monthStart;

      const inWindow = (d: string | null | undefined) => {
        if (!d) return false;
        const day = d.slice(0, 10);
        return day > cycleStart && day <= today;
      };

      if (linked.some((t) => t.status === "cleared" && inWindow(t.transaction_date)))
        return "cleared";
      if (linked.some((t) => t.status === "pending")) return "pending";
      return "unpaid";
    };
  }, [transactions]);
}
