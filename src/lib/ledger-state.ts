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
  /** Inclusive-ish date window the cycle math counted (null for one-time items). */
  windowStart: string | null;
  windowEnd: string | null;
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

      // ADR-086: a monthly item's cycle is the calendar month, not a window
      // hung off next_due_date. A bill due the 21st belongs to that whole
      // month, so an early (the 3rd) or late (the 30th) payment both land on
      // the same cycle, and the cycle resets on the 1st.
      const monthly = (cycleName ?? "monthly").toLowerCase().replace(/[\s_-]/g, "") === "monthly";
      const monthEnd = (() => {
        const [y, m] = today.split("-").map(Number);
        const last = new Date(Date.UTC(y!, m!, 0)).getUTCDate();
        return `${today.slice(0, 7)}-${String(last).padStart(2, "0")}`;
      })();

      // ADR-075: a transaction tagged with the due date it already resolved
      // belongs to that (now past) cycle, never to a later one — exclude it
      // regardless of where its raw transaction_date falls. Untagged
      // transactions (existing data, or resolves that predate this column)
      // fall through to the date-window logic below unchanged.
      // Under ADR-086 the monthly comparison is by month, not by due date: a
      // payment tagged with this month's due date still belongs to this month
      // even after clearing rolled next_due_date into the next one.
      const eligible = dueDate
        ? linked.filter((t) => {
            const tagged = day(t.resolved_cycle_due_date);
            if (!tagged) return true;
            return monthly ? tagged >= monthStart : tagged >= dueDate;
          })
        : linked;

      const between = (t: Transaction, start: string, end: string) => {
        const d = day(t.transaction_date);
        return !!d && d > start && d <= end;
      };

      const inMonth = (t: Transaction) => {
        const d = day(t.transaction_date);
        return !!d && d >= monthStart && d <= monthEnd;
      };

      // ADR-068 addendum: a deduction-funded payable is settled by the *deposit*
      // row the deduction writes into its destination account (e.g. a TSP loan
      // repayment lands as money INTO the TSP account). That row is positive,
      // so the normal `-amount` netting below read it as a refund and the cycle
      // stayed UNPAID. For such payables, the deduction's own deposit rows count
      // by magnitude; every other row (including a `Reversed: …` correction)
      // keeps the signed behaviour so reversals still cancel payments.
      const fundingDeductionId =
        (p.kind === "bill" ? p.bill?.funding_deduction_id : p.debt?.funding_deduction_id) ??
        null;
      const isDeductionDeposit = (t: Transaction) =>
        !!fundingDeductionId &&
        Number(t.amount ?? 0) > 0 &&
        (t.description ?? "").trim().toLowerCase().startsWith("deduction:");
      /** Signed contribution of a transaction toward the amount paid this cycle. */
      const paidBy = (t: Transaction) =>
        isDeductionDeposit(t) ? Math.abs(Number(t.amount ?? 0)) : -Number(t.amount ?? 0);


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
      // (Non-monthly cycles only — monthly uses the calendar month above.)
      const pastDue = !!dueDate && today > dueDate;
      let cycleTx = oneTime
        ? eligible
        : monthly
          ? eligible.filter(inMonth)
          : pastDue
            ? eligible.filter((t) => {
                const d = day(t.transaction_date);
                return !!d && d >= dueDate! && d <= today;
              })
            : eligible.filter((t) => between(t, openStart, today));
      let resolved = false;
      // The exact date range this derivation counted transactions in — surfaced
      // so a detail screen can show which window the math used.
      let windowStart: string | null = oneTime
        ? null
        : monthly
          ? monthStart
          : pastDue
            ? dueDate!
            : openStart;
      let windowEnd: string | null = oneTime
        ? null
        : monthly
          ? monthEnd
          : pastDue
            ? today
            : dueDate || today;




      if (!monthly && cycleTx.length === 0 && dueDate && today <= openStart) {
        // The cycle covering today may already have been resolved and rolled forward.
        const prevStart = shiftDateSafe(openStart, cycleName, -1, cycleDays);
        const prev = eligible.filter((t) => between(t, prevStart, openStart));
        // ADR-008: net signed amounts rather than summing absolute values, so a
        // correcting/reversal transaction offsets the payment it reverses
        // instead of double-counting alongside it.
        const clearedPrev = Math.max(
          0,
          prev
            .filter((t) => t.status === "cleared")
            .reduce((s, t) => s + paidBy(t), 0),
        );
        if (prev.length > 0 && due > 0 && clearedPrev + 0.005 >= due) {
          cycleTx = prev;
          resolved = true;
          windowStart = prevStart;
          windowEnd = openStart;
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
          .reduce((s, t) => s + paidBy(t), 0),
      );

      let state: LedgerState = "unpaid";
      if (pending) state = "pending";
      else if (due > 0 && clearedSum + 0.005 >= due) state = "cleared";
      else if (clearedSum > 0) state = "partial";

      // ADR-036 addendum (2026-08-19): a debt whose balance has already
      // reached zero is cleared regardless of what this cycle's ledger
      // transactions show — matches the Debts screen's own isPaidOff
      // definition instead of a paid-off debt reading UNPAID forever
      // because it was never paid through Hearthstone's own pay flow.
      if (p.kind === "debt" && Number(p.debt?.remaining_balance ?? 0) <= 0) {
        state = "cleared";
      }

      // ADR-086: a monthly cycle counted inside its own calendar month, so the
      // lookback above never runs — but the cycle still "resolved" (rolled the
      // due date into a later month) once it cleared. Callers that repair
      // stranded payments / reverse a roll rely on this flag.
      if (monthly && !oneTime && dueDate && dueDate > monthEnd && state === "cleared") {
        resolved = true;
      }


      return {
        state,
        due,
        clearedSum,
        remaining: state === "cleared" ? 0 : Math.max(0, due - clearedSum),
        transactions: cycleTx,
        pending,
        resolved,
        windowStart,
        windowEnd,
      };

    }
  }
}

/**
 * ADR-085 addendum: `refDate` lets a detail screen re-derive a prior cycle's
 * state (a month stepper on Bills/Debts detail). It defaults to the real today,
 * so every existing call site is unchanged. `deriveCycleInfo` is already a pure
 * function of its reference date; only monthly items reconstruct a past cycle
 * faithfully (calendar-month window) — non-monthly windows hang off the mutable
 * `next_due_date` and can't be walked back, so callers only expose the stepper
 * for monthly items.
 */
export function useCycleState(refDate?: string) {
  const { data: transactions = [] } = useTransactions();
  return useMemo(() => {
    const today = refDate ?? todayISO();
    return (p: Payable) => deriveCycleInfo(p, transactions, today);
  }, [transactions, refDate]);
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
