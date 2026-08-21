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

  // A monthly debt/bill's due date recurs (recomputed from today, never
  // advanced/rolled the way other cycles are — see debtDueDate()), so
  // clearing it leaves no due-date signal that the CURRENT cycle is already
  // settled; only payment_status='cleared' says so. Trust that flag for the
  // walk's first (current) cycle ONLY when the row was actually touched
  // recently enough to plausibly be for the cycle just walked past — a stale
  // 'cleared' left over from an earlier month must still count as missed, or
  // a genuinely-overdue debt could get silently hidden.
  const clearedRecently =
    cycle === "monthly" &&
    row.payment_status === "cleared" &&
    !!row.updated_at &&
    !!start &&
    row.updated_at.slice(0, 10) >= shiftDateSafe(start, cycle, -1, intervalDays);

  if (start && due > 0) {
    let cursor = start;
    let guard = 0;
    let first = true;
    while (cursor < today && guard < 240) {
      guard += 1;
      const counts = !asOf || cursor > asOf;
      if (counts && !(first && clearedRecently)) {
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

/**
 * ADR-076: arrears owed strictly from cycles BEFORE the current one — excludes
 * whatever the current (still-open) cycle itself still owes, since that's
 * credited separately through the normal Submit/Clear flow. `computeArrears`
 * folds the current cycle's own remainder into `amountOverdue` once it's
 * overdue (its "first" walk iteration); this subtracts that back out. Used to
 * cap/reduce arrears-only payments, and to generalize `applyClearedPayment`'s
 * overflow reduction so it works whether arrears came from missed cycles or a
 * manual `opening_arrears` carry-in.
 */
export function priorCyclesArrears(p: Payable, today = todayISO()): number {
  const a = computeArrears(p, today);
  if (a.cyclesMissed === 0) return a.amountOverdue;
  const row = p.kind === "bill" ? p.bill : p.debt;
  if (!row) return a.amountOverdue;
  const due = p.kind === "bill" ? billCycleDue(p.bill!) : debtCycleDue(p.debt!);
  const paidThisCycle = Math.max(0, Number(row.cycle_paid_to_date ?? 0));
  const currentCycleRemaining = Math.max(0, due - paidThisCycle);
  return Math.max(0, Math.round((a.amountOverdue - currentCycleRemaining) * 100) / 100);
}

/**
 * ADR-076: the `resolved_cycle_due_date` tag for a payment logged directly
 * against arrears — always one cycle before the payable's current due date,
 * so `deriveCycleInfo` (ADR-075, `tagged >= dueDate`) excludes it from the
 * current cycle's window.
 *
 * Deliberately NOT `computeArrears(...).oldestMissedDate`: that walk always
 * starts AT the current due date (`payableDueDate(p)` — the same value used
 * as the walk's own `start`), so whenever it's set at all it's >= the current
 * due date, never before it. Fixed 2026-08-21: an earlier version returned it
 * directly, so a payable whose current cycle was ITSELF overdue tagged the
 * arrears payment with the current due date — landing inside the current
 * cycle's own window. The payment then read as a partial payment of the
 * current cycle AND tripped the stranded-payment repair panel (cleared in
 * the ledger, never credited to cycle_paid_to_date).
 */
export function arrearsPaymentTag(p: Payable, today = todayISO()): string | null {
  const dueDate = payableDueDate(p);
  if (!dueDate) return computeArrears(p, today).oldestMissedDate;
  const row = p.kind === "bill" ? p.bill : p.debt;
  const cycle = (row?.billing_cycle ?? "monthly").toLowerCase();
  const intervalDays = row?.cycle_interval_days;
  return shiftDateSafe(dueDate, cycle, -1, intervalDays);
}


/** Short badge copy: "2 cycles · $420 past due". */
export function arrearsLabel(a: Arrears, money: (n: number) => string): string | null {
  if (a.amountOverdue <= 0.005) return null;
  const cycles =
    a.cyclesMissed > 0 ? `${a.cyclesMissed} cycle${a.cyclesMissed === 1 ? "" : "s"} · ` : "";
  return `${cycles}${money(a.amountOverdue)} past due`;
}
