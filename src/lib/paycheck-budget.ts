import type { Account, AutoTransfer, Bill, Category, Debt, IncomeEvent, IncomeSource, Transaction } from "./supabase";
import { debtDueDate, shiftDateSafe } from "./format";
import { internalTransferIds, opaqueTransferAccountIds, reverseOpaqueTransferIds } from "./internal-transfers";

export function todayISO() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(
    n.getDate(),
  ).padStart(2, "0")}`;
}

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
  kind: "bill" | "debt" | "auto_transfer";
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
 * True when `due` falls inside [start, end), OR when it's already overdue
 * (before `start`) and the period being viewed hasn't fully elapsed yet
 * (`end > today`) — an unpaid bill/debt doesn't drop off the "due this
 * period" list just because its due date slipped into the past; it keeps
 * showing, with its normal per-cycle amount, in the current period and every
 * future one until it's actually paid (which is the only thing that ever
 * advances `next_due_date`/`debtDueDate` past `start`). Past periods that
 * have already fully elapsed are left alone — this isn't retroactive.
 */
function isDueOrOverdueInPeriod(
  due: string | null | undefined,
  start: string,
  end: string,
  today: string,
): boolean {
  if (!due) return false;
  if (inRange(due, start, end)) return true;
  return due < start && end > today;
}

/**
 * Bills, debts and auto-transfers (ADR-081) whose effective due date lands
 * inside the pay period, or is still overdue from before it (see
 * `isDueOrOverdueInPeriod`). Paycheck-deducted debts (ADR-032) are excluded —
 * list them separately with `deductedObligationsInRange()`.
 */
export function obligationsInRange(
  bills: Bill[],
  debts: Debt[],
  autoTransfers: AutoTransfer[],
  start: string,
  end: string,
  /** ADR-060: when set, project recurrences forward through this date. */
  projectThrough?: string | null,
  today: string = todayISO(),
): Obligation[] {
  const rows: Obligation[] = [];
  const through = projectThrough?.slice(0, 10) ?? null;
  for (const b of bills) {
    if (b.is_active === false) continue;
    const due = b.next_due_date?.slice(0, 10) ?? null;
    const amount = Number(b.cycle_amount_due ?? b.amount ?? 0);
    if (isDueOrOverdueInPeriod(due, start, end, today)) {
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
    if (isDueOrOverdueInPeriod(due, start, end, today)) {
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
  for (const at of autoTransfers) {
    if (at.is_active === false) continue;
    const due = at.next_due_date?.slice(0, 10) ?? null;
    const amount = Number(at.amount ?? 0);
    if (isDueOrOverdueInPeriod(due, start, end, today)) {
      rows.push({ id: at.id, kind: "auto_transfer", name: at.name, dueDate: due!, amount });
    }
    if (through) {
      for (const p of projectOccurrences(at, due, through)) {
        if (!inRange(p, start, end)) continue;
        rows.push({
          id: at.id,
          kind: "auto_transfer",
          name: at.name,
          dueDate: p,
          amount,
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
  today: string = todayISO(),
): Obligation[] {
  const rows: Obligation[] = [];
  for (const d of debts) {
    if (d.date_paid_off) continue;
    if (!isPaycheckDeducted(d)) continue;
    const due = debtDueDate(d);
    if (!isDueOrOverdueInPeriod(due, start, end, today)) continue;
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

/**
 * ADR-071: an item with a manually planned pay_period_allocations row for
 * this period has its auto-matched due-date amount excluded from the total —
 * the Planned row already represents the real expected payment, so counting
 * both double-subtracts it from Left-to-allocate. Individual "Due this
 * period" line items are unaffected; this only changes the aggregate total.
 * `plannedKeys` entries are `"bill:<id>"` / `"debt:<id>"`.
 */
export function obligationsTotalExcludingPlanned(
  obligations: Obligation[],
  plannedKeys: Set<string>,
): number {
  return sum(
    obligations.filter((o) => !plannedKeys.has(`${o.kind}:${o.id}`)).map((o) => o.amount),
  );
}

export type CategoryActual = {
  spendingSpent: number;
  billsSpent: number;
  debtsSpent: number;
  total: number;
};

/**
 * Combined bills+debts+spending actual per category for an arbitrary date
 * range (e.g. a pay period), rather than a calendar month. Mirrors
 * `monthly-summary.ts`'s `combinedActualByCategory()` — kept separate (not
 * imported from there) since that module already imports `isPaycheckDeducted`
 * from this one, and the Monthly Summary card must stay calendar-month exact.
 * Paycheck-deducted debts (ADR-032) are excluded, same as everywhere else.
 */
export function actualByCategoryInRange(
  transactions: Transaction[],
  bills: Bill[],
  debts: Debt[],
  categories: Category[],
  start: string,
  end: string,
  /** ADR-089: two-sided transfer group ids (`internalTransferIds()`) — a
   *  transfer's negative leg can carry a spending category (ADR-064 applies
   *  one category to both rows of the pair), but it isn't money leaving the
   *  household, so it's excluded here the same as every other spend total. */
  internalTransferGroupIds?: Set<string>,
): Map<string, CategoryActual> {
  const income = new Set(
    categories.filter((c) => (c.domain ?? "").toLowerCase() === "income").map((c) => c.id),
  );
  const billCategory = new Map<string, string | null>(bills.map((b) => [b.id, (b.category_id as string | null) ?? null]));
  const debtCategory = new Map<string, string | null>(debts.map((d) => [d.id, (d.category_id as string | null) ?? null]));
  const deductedDebtIds = new Set(debts.filter(isPaycheckDeducted).map((d) => d.id));
  const out = new Map<string, CategoryActual>();

  const bump = (
    categoryId: string,
    field: "spendingSpent" | "billsSpent" | "debtsSpent",
    amount: number,
  ) => {
    const row = out.get(categoryId) ?? { spendingSpent: 0, billsSpent: 0, debtsSpent: 0, total: 0 };
    row[field] += amount;
    row.total += amount;
    out.set(categoryId, row);
  };

  for (const t of transactions) {
    if (!inRange(t.transaction_date, start, end)) continue;
    if (t.transfer_group_id && internalTransferGroupIds?.has(t.transfer_group_id)) continue;
    const amount = Number(t.amount || 0);
    if (amount >= 0) continue; // only money out counts as spend
    const linkedBillId = t.linked_bill_id ?? null;
    const linkedDebtId = t.linked_debt_id ?? null;
    if (linkedDebtId && deductedDebtIds.has(linkedDebtId)) continue; // ADR-032
    let categoryId: string | null = (t as { category_id?: string | null }).category_id ?? null;
    if (!categoryId && linkedBillId) categoryId = billCategory.get(linkedBillId) ?? null;
    if (!categoryId && linkedDebtId) categoryId = debtCategory.get(linkedDebtId) ?? null;
    if (!categoryId) continue;
    if (income.has(categoryId)) continue; // ADR-069
    if (linkedDebtId) bump(categoryId, "debtsSpent", Math.abs(amount));
    else if (linkedBillId) bump(categoryId, "billsSpent", Math.abs(amount));
    else bump(categoryId, "spendingSpent", Math.abs(amount));
  }
  return out;
}

export type MonthlyIncomeExpense = {
  /** ISO first-of-month. */
  date: string;
  label: string;
  income: number;
  expenses: number;
};

/**
 * Total income vs. total expenses per calendar month across [start, end)
 * (year-in-review's own range, not a pay period). Reuses the same
 * income-category-id `Set` `actualByCategoryInRange` builds
 * (categories.domain === "income") rather than re-deriving it — a
 * transaction's sign alone can't tell income from a refund/correction on an
 * expense category, so domain is the source of truth here too.
 *
 * ADR-109: also excludes ordinary two-sided internal transfers entirely
 * (they carry no category and were previously falling through to the
 * expenses bucket unexcluded — the only calculator in the codebase that
 * didn't already exclude them), and recognizes the receiving leg of a
 * reverse-opaque transfer (ADR-107's flagged-account carve-out, reverse
 * direction) as income instead of leaving it neutral.
 */
export function monthlyIncomeVsExpenses(
  transactions: Transaction[],
  categories: Category[],
  start: string,
  end: string,
  accounts: Account[] = [],
): MonthlyIncomeExpense[] {
  const income = new Set(
    categories.filter((c) => (c.domain ?? "").toLowerCase() === "income").map((c) => c.id),
  );
  const opaqueAccountIds = opaqueTransferAccountIds(accounts);
  const internal = internalTransferIds(transactions, opaqueAccountIds);
  const reverseOpaque = reverseOpaqueTransferIds(transactions, opaqueAccountIds);
  const byMonth = new Map<string, { income: number; expenses: number }>();
  for (const t of transactions) {
    if (!inRange(t.transaction_date, start, end)) continue;
    const amount = Number(t.amount || 0);
    if (!amount) continue;
    const monthKey = t.transaction_date.slice(0, 7) + "-01";
    const gid = t.transfer_group_id ?? null;
    if (gid && internal.has(gid)) {
      if (reverseOpaque.has(gid) && amount > 0) {
        const row = byMonth.get(monthKey) ?? { income: 0, expenses: 0 };
        row.income += amount;
        byMonth.set(monthKey, row);
      }
      // Every other two-sided internal transfer leg (both legs of a plain
      // transfer, or the sending/opaque leg of a reverse-opaque pair) stays
      // neutral — it's not spend or income, same as everywhere else.
      continue;
    }
    const categoryId = (t as { category_id?: string | null }).category_id ?? null;
    const isIncome = !!categoryId && income.has(categoryId);
    // A negative amount on an income category (a correction/clawback) and a
    // positive one on an expense category (a refund) are both real, but
    // neither is "income" or "an expense" in the sense this chart means —
    // skip rather than mis-bucket or spuriously seed an all-zero month.
    if (isIncome && amount <= 0) continue;
    if (!isIncome && amount >= 0) continue;
    const row = byMonth.get(monthKey) ?? { income: 0, expenses: 0 };
    if (isIncome) row.income += amount;
    else row.expenses += Math.abs(amount);
    byMonth.set(monthKey, row);
  }
  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      label: new Date(`${date}T00:00:00`).toLocaleDateString("en-US", { month: "short" }),
      income: v.income,
      expenses: v.expenses,
    }));
}
