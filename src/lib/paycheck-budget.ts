import type { Bill, Debt, IncomeEvent } from "./supabase";
import { debtDueDate } from "./format";

/** The date a paycheck actually lands on: actual when received, else expected. */
export function eventDate(e: IncomeEvent): string | null {
  return (e.actual_date ?? e.expected_date)?.slice(0, 10) ?? null;
}

/** The money a paycheck brings in: actual when received, else expected. */
export function eventAmount(e: IncomeEvent): number {
  const actual = e.actual_amount;
  if (actual !== null && actual !== undefined) return Number(actual);
  return Number(e.expected_amount ?? 0);
}

export function isReceived(e: IncomeEvent): boolean {
  return e.actual_date != null || (e.status ?? "").toLowerCase() === "received";
}

function addDays(date: string, days: number): string {
  const [y, m, d] = date.slice(0, 10).split("-").map(Number);
  const base = new Date(y, m - 1, d);
  base.setDate(base.getDate() + days);
  return `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, "0")}-${String(
    base.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * A pay period runs from this primary paycheck's date up to (but not including)
 * the next primary paycheck's date, or 14 days out when none exists yet.
 */
export function periodRange(
  event: IncomeEvent,
  primaryEvents: IncomeEvent[],
): { start: string; end: string } | null {
  const start = eventDate(event);
  if (!start) return null;
  const later = primaryEvents
    .filter((e) => e.id !== event.id)
    .map(eventDate)
    .filter((d): d is string => !!d && d > start)
    .sort();
  return { start, end: later[0] ?? addDays(start, 14) };
}

export function inRange(date: string | null | undefined, start: string, end: string) {
  if (!date) return false;
  const d = date.slice(0, 10);
  return d >= start && d < end;
}

export type Obligation = {
  id: string;
  kind: "bill" | "debt";
  name: string;
  dueDate: string;
  amount: number;
};

/** Bills and debts whose effective due date lands inside the pay period. */
export function obligationsInRange(
  bills: Bill[],
  debts: Debt[],
  start: string,
  end: string,
): Obligation[] {
  const rows: Obligation[] = [];
  for (const b of bills) {
    if (b.is_active === false) continue;
    const due = b.next_due_date?.slice(0, 10) ?? null;
    if (!inRange(due, start, end)) continue;
    const amount = Number(b.cycle_amount_due ?? b.amount ?? 0);
    rows.push({ id: b.id, kind: "bill", name: b.name, dueDate: due!, amount });
  }
  for (const d of debts) {
    if (d.date_paid_off) continue;
    const due = debtDueDate(d);
    if (!inRange(due, start, end)) continue;
    rows.push({
      id: d.id,
      kind: "debt",
      name: d.name,
      dueDate: due!,
      amount: Number(d.minimum_payment ?? 0),
    });
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

export function sum(values: number[]): number {
  return values.reduce((t, v) => t + v, 0);
}
