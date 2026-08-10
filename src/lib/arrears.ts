import { debtDueDate, shiftDateSafe } from "./format";
import { billCycleDue, debtCycleDue, type Payable } from "./payments";

/**
 * ADR-049: how far behind a bill/debt is, in money — not just "overdue".
 *
 * Two parts are added together:
 *  1. `opening_arrears` — a manual figure for what was already past due before
 *     this app started tracking the item (the ledger has no history for it),
 *     ignored for cycles on or before `arrears_as_of`.
 *  2. Missed cycles — every due date that has passed without the cycle being
 *     covered, walked forward from the item's current due date.
 */
export type Arrears = {
  cyclesMissed: number;
  /** Total past due: opening arrears + unpaid amounts of missed cycles. */
  amountOverdue: number;
  /** Manual carry-in portion of `amountOverdue`. */
  openingArrears: number;
  oldestMissedDate: string | null;
};

const EMPTY: Arrears = {
  cyclesMissed: 0,
  amountOverdue: 0,
  openingArrears: 0,
  oldestMissedDate: null,
};

const day = (d: string | null | undefined) => (d ? d.slice(0, 10) : null);

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

/** The item's current (earliest unresolved) due date, or null when undated. */
export function payableDueDate(p: Payable): string | null {
  if (p.kind === "bill") return day(p.bill?.next_due_date);
  return p.debt ? debtDueDate(p.debt) : null;
}

/**
 * Walk from the current due date forward until today, counting each due date
 * that has already passed. The first (current) cycle only counts what is still
 * owed on it; earlier-rolled cycles are already reflected by the due date, so
 * every subsequent passed date counts the full cycle amount.
 */
export function computeArrears(p: Payable, today = todayISO()): Arrears {
  const row = p.kind === "bill" ? p.bill : p.debt;
  if (!row) return EMPTY;

  const openingArrears = Math.max(0, Number(row.opening_arrears ?? 0));
  const asOf = day(row.arrears_as_of);
  const paidOff = p.kind === "debt" && Number(p.debt?.remaining_balance ?? 0) <= 0;
  if (paidOff) {
    return { ...EMPTY, openingArrears, amountOverdue: openingArrears };
  }

  const due = p.kind === "bill" ? billCycleDue(p.bill!) : debtCycleDue(p.debt!);
  const paidThisCycle = Math.max(0, Number(row.cycle_paid_to_date ?? 0));
  const cycle = (row.billing_cycle ?? "monthly").toLowerCase();
  const intervalDays = row.cycle_interval_days;
  const start = payableDueDate(p);

  let cyclesMissed = 0;
  let missedAmount = 0;
  let oldest: string | null = null;

  if (start && due > 0) {
    let cursor = start;
    let guard = 0;
    let first = true;
    while (cursor < today && guard < 240) {
      guard += 1;
      const counts = !asOf || cursor > asOf;
      if (counts) {
        const amount = first ? Math.max(0, due - paidThisCycle) : due;
        if (amount > 0.005) {
          cyclesMissed += 1;
          missedAmount += amount;
          if (!oldest) oldest = cursor;
        }
      }
      first = false;
      // one-time charges have no following cycle to miss
      if (cycle === "one_time" || cycle === "onetime") break;
      const next = shiftDateSafe(cursor, cycle, 1, intervalDays);
      if (next <= cursor) break; // unset custom interval — stop instead of looping
      cursor = next;
    }
  }

  return {
    cyclesMissed,
    openingArrears,
    amountOverdue: Math.round((openingArrears + missedAmount) * 100) / 100,
    oldestMissedDate: oldest,
  };
}

/** Short badge copy: "2 cycles · $420 past due". */
export function arrearsLabel(a: Arrears, money: (n: number) => string): string | null {
  if (a.amountOverdue <= 0.005) return null;
  const cycles =
    a.cyclesMissed > 0 ? `${a.cyclesMissed} cycle${a.cyclesMissed === 1 ? "" : "s"} · ` : "";
  return `${cycles}${money(a.amountOverdue)} past due`;
}
