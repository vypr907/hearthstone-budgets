/**
 * Shared pay-period helpers (ADR-059/060 periods).
 *
 * The primary income source's paychecks define the household's pay periods.
 * Both the Debt detail dialog and the Everything screen's "due this pay
 * period" filter read from here so there's a single implementation.
 */
import { periodRange, inRange } from "@/lib/paycheck-budget";
import { todayISO } from "@/lib/snapshot";

type SourceLike = { id: string; is_primary?: boolean | null };
type EventLike = Parameters<typeof periodRange>[0] & { income_source_id?: string | null };

export type Period = { start: string; end: string };

function primaryEventsOf(sources: SourceLike[], events: EventLike[]): EventLike[] {
  const primary = sources.find((s) => s.is_primary);
  if (!primary) return [];
  return events.filter((e) => e.income_source_id === primary.id);
}

/** The pay period a given date falls into, or null when none covers it. */
export function payPeriodForDate(
  date: string | null | undefined,
  sources: SourceLike[],
  events: EventLike[],
): Period | null {
  if (!date) return null;
  const primaryEvents = primaryEventsOf(sources, events);
  for (const e of primaryEvents) {
    const range = periodRange(e, primaryEvents as never);
    if (range && inRange(date, range.start, range.end)) return range;
  }
  return null;
}

/** The pay period covering today, or null when none does. */
export function currentPayPeriod(
  sources: SourceLike[],
  events: EventLike[],
  today: string = todayISO(),
): Period | null {
  return payPeriodForDate(today, sources, events);
}

/**
 * True when `due` lands inside the period, or is still overdue from before it
 * while the period hasn't fully elapsed (same rule as the paycheck budget).
 */
export function dueInPeriod(
  due: string | null | undefined,
  period: Period,
  today: string = todayISO(),
): boolean {
  if (!due) return false;
  if (inRange(due, period.start, period.end)) return true;
  return due < period.start && period.end > today;
}

/** Current calendar month window as [start, endExclusive). */
export function currentMonthWindow(today: string = todayISO()): Period {
  const start = `${today.slice(0, 7)}-01`;
  const d = new Date(`${start}T00:00:00`);
  d.setMonth(d.getMonth() + 1);
  const end = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
  return { start, end };
}
