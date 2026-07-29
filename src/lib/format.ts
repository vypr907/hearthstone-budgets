export function formatMoney(n: number | null | undefined): string {
  const v = typeof n === "number" ? n : 0;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(v);
}

export function isOverdue(dueDay: number | null | undefined, status: string | null | undefined) {
  if (!dueDay) return false;
  if (status === "paid" || status === "cleared") return false;
  const today = new Date().getDate();
  return today > dueDay;
}

/** Bills store a full date; derive the day-of-month for display/sorting. */
export function dueDayFromDate(d: string | null | undefined): number | null {
  if (!d) return null;
  const day = Number(d.slice(8, 10));
  return Number.isFinite(day) && day > 0 ? day : null;
}

function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

/** A dated obligation is overdue when its date has passed and it isn't paid. */
export function isDateOverdue(
  date: string | null | undefined,
  status: string | null | undefined,
) {
  if (!date) return false;
  if (status === "paid" || status === "cleared") return false;
  return date.slice(0, 10) < todayISO();
}

/** Day-of-month for the current month, used to sort debts alongside bills. */
export function dueDayToDate(day: number | null | undefined): string | null {
  if (!day) return null;
  const n = new Date();
  const last = new Date(n.getFullYear(), n.getMonth() + 1, 0).getDate();
  const d = Math.min(day, last);
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Normalize stored cycle values ("Bi-Weekly", "bi weekly", …) to a known key. */
function normalizeCycle(cycle: string | null | undefined): string {
  return (cycle ?? "").toLowerCase().replace(/[\s_-]/g, "");
}

/**
 * Shift an ISO date by one billing-cycle interval.
 * direction 1 advances (clearing), -1 reverses (undo). 'custom' never moves.
 */
export function shiftDate(
  date: string,
  cycle: string | null | undefined,
  direction: 1 | -1 = 1,
): string {
  const key = normalizeCycle(cycle);
  if (key === "custom") return date.slice(0, 10);
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const base = new Date(y, m - 1, d);
  switch (key) {
    case "biweekly":
      base.setDate(base.getDate() + 14 * direction);
      break;
    case "bimonthly":
      addMonths(base, 2 * direction, d);
      break;
    case "quarterly":
      addMonths(base, 3 * direction, d);
      break;
    case "annually":
    case "annual":
    case "yearly":
      addMonths(base, 12 * direction, d);
      break;
    default:
      addMonths(base, 1 * direction, d);
  }
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(
    base.getDate(),
  ).padStart(2, "0")}`;
}

/** Advance an ISO date by one billing-cycle interval. */
export function advanceDate(date: string, cycle: string | null | undefined): string {
  return shiftDate(date, cycle, 1);
}

/** Reverse an ISO date by one billing-cycle interval (undo). */
export function reverseDate(date: string, cycle: string | null | undefined): string {
  return shiftDate(date, cycle, -1);
}


function addMonths(date: Date, months: number, targetDay: number) {
  date.setDate(1);
  date.setMonth(date.getMonth() + months);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
  date.setDate(Math.min(targetDay, last));
}

