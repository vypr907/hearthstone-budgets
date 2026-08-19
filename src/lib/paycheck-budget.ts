import type { Bill, Debt, IncomeEvent, IncomeSource } from "./supabase";
import { debtDueDate, shiftDateSafe } from "./format";

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

/**
 * The next date the household's primary income source is scheduled to pay,
 * strictly after `after`. Null when there's no primary source or no
 * scheduled event after that date — callers should leave a date field blank
 * rather than guess, same as when no income data exists at all.
 */
export function nextPayDate(
  sources: IncomeSource[],
  events: IncomeEvent[],
  after: string,
): string | null {
  const primary = sources.find((s) => s.is_primary) ?? null;
  if (!primary) return null;
  const upcoming = events
    .filter((e) => e.income_source_id === primary.id)
    .map(eventDate)
    .filter((d): d is string => !!d && d > after)
    .sort();
  return upcoming[0] ?? null;
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
  /** ADR-060: a forward-projected recurrence, not the item's stored due date. */
  projected?: boolean;
};

/**
 * ADR-060: forward recurrences of a bill/debt, starting from its current due
 * date and advancing one billing cycle at a time (reusing advanceDate's interval
 * math via shiftDateSafe) until the date passes `throughDate`. The stored due
 * date itself is never returned — only future projections.
 */
export function projectOccurrences(
  item: {
    billing_cycle?: string | null;
    cycle_interval_days?: number | null;
    next_due_date?: string | null;
  },
  fromDate: string | null | undefined,
  throughDate: string,
): string[] {
  const start = fromDate?.slice(0, 10);
  if (!start) return [];
  const cycle = (item.billing_cycle ?? "monthly").toLowerCase();
  if (cycle === "one_time") return [];
  const out: string[] = [];
  let cur = start;
  for (let i = 0; i < 240; i++) {
    const next = shiftDateSafe(cur, item.billing_cycle, 1, item.cycle_interval_days);
    if (next <= cur) break; // no interval math available — don't loop forever
    cur = next;
    if (cur > throughDate) break;
    out.push(cur);
  }
  return out;
}

/** ADR-032: debts serviced by payroll/HSA deduction never touch spendable cash. */
export function isPaycheckDeducted(debt: Debt): boolean {
  return debt.is_paycheck_deduction === true;
}

/**
 * Bills and debts whose effective due date lands inside the pay period.
 * Paycheck-deducted debts (ADR-032) are excluded — list them separately with
 * `deductedObligationsInRange()`.
 */
export function obligationsInRange(
  bills: Bill[],
  debts: Debt[],
  start: string,
  end: string,
  /** ADR-060: when set, project recurrences forward through this date. */
  projectThrough?: string | null,
): Obligation[] {
  const rows: Obligation[] = [];
  const through = projectThrough?.slice(0, 10) ?? null;
  for (const b of bills) {
    if (b.is_active === false) continue;
    const due = b.next_due_date?.slice(0, 10) ?? null;
    const amount = Number(b.cycle_amount_due ?? b.amount ?? 0);
    if (inRange(due, start, end)) {
      rows.push({ id: b.id, kind: "bill", name: b.name, dueDate: due!, amount });
    }
    if (through) {
      for (const p of projectOccurrences(b, due, through)) {
        if (!inRange(p, start, end)) continue;
        rows.push({
          id: b.id,
          kind: "bill",
          name: b.name,
          dueDate: p,
          amount: Number(b.amount ?? 0),
          projected: true,
        });
      }
    }
  }
  for (const d of debts) {
    if (d.date_paid_off) continue;
    if (isPaycheckDeducted(d)) continue;
    const due = debtDueDate(d);
    if (inRange(due, start, end)) {
      rows.push({
        id: d.id,
        kind: "debt",
        name: d.name,
        dueDate: due!,
        amount: Number(d.minimum_payment ?? 0),
      });
    }
    if (through) {
      for (const p of projectOccurrences(d, due, through)) {
        if (!inRange(p, start, end)) continue;
        rows.push({
          id: d.id,
          kind: "debt",
          name: d.name,
          dueDate: p,
          amount: Number(d.minimum_payment ?? 0),
          projected: true,
        });
      }
    }
  }
  return rows.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}

/** ADR-032: paycheck-deducted debts due in the period — shown, never counted. */
export function deductedObligationsInRange(
  debts: Debt[],
  start: string,
  end: string,
): Obligation[] {
  const rows: Obligation[] = [];
  for (const d of debts) {
    if (d.date_paid_off) continue;
    if (!isPaycheckDeducted(d)) continue;
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
