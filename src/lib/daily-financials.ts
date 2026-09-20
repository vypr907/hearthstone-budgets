/**
 * ADR-108: day-scoped ledger aggregation for the Daily Financials screen and
 * the Dashboard's daily-spend chart. Mirrors the conventions already used by
 * `spending-actuals.ts` (buildActualResolver) and
 * `routes/app.spending-by-place.tsx` (direct `transactions.institution_id`
 * grouping, ADR-053) rather than introducing new ones.
 */
import type { Bill, Category, Debt, Institution, Transaction } from "./supabase";
import { categoryDomain } from "./data-hooks";
import { addDaysISO } from "./format";

function isIncomeCategory(categoryId: string, categories: Category[]): boolean {
  const c = categories.find((cat) => cat.id === categoryId);
  return categoryDomain(c) === "income";
}

/**
 * Whole-ledger cash movement for one day — every transaction dated `day`,
 * two-sided internal transfer legs excluded (ADR-089/107), no category or
 * bill/debt filtering. Used for the Daily Financials header totals and, via
 * `dailySpendSeries` below, the Dashboard chart.
 */
export function dayMoneyInOut(
  transactions: Transaction[],
  internalTransferGroupIds: Set<string>,
  day: string,
): { in: number; out: number; net: number } {
  let moneyIn = 0;
  let moneyOut = 0;
  for (const t of transactions) {
    if ((t.transaction_date ?? "").slice(0, 10) !== day) continue;
    if (t.transfer_group_id && internalTransferGroupIds.has(t.transfer_group_id)) continue;
    const amount = Number(t.amount || 0);
    if (amount > 0) moneyIn += amount;
    else if (amount < 0) moneyOut += Math.abs(amount);
  }
  return { in: moneyIn, out: moneyOut, net: moneyIn - moneyOut };
}

export type DailyCategorySpend = {
  categoryId: string;
  category: Category | null;
  total: number;
  byInstitution: Array<{
    institutionId: string | null;
    institution: Institution | null;
    amount: number;
  }>;
};

/**
 * Spending-only breakdown by category for one day, each category further
 * split by the place it happened at. Deliberately excludes any transaction
 * carrying `linked_bill_id`/`linked_debt_id` (ADR-108) — those are shown
 * only in `billsDebtsPaidOnDay` below, so the same dollar never appears
 * twice on the Daily Financials screen.
 */
export function dailySpendByCategory(
  transactions: Transaction[],
  categories: Category[],
  institutions: Institution[],
  internalTransferGroupIds: Set<string>,
  day: string,
): DailyCategorySpend[] {
  const byCategory = new Map<string, Map<string | null, number>>();

  for (const t of transactions) {
    if ((t.transaction_date ?? "").slice(0, 10) !== day) continue;
    if (t.transfer_group_id && internalTransferGroupIds.has(t.transfer_group_id)) continue;
    if (t.linked_bill_id || t.linked_debt_id) continue; // ADR-108: spending-only
    const amount = Number(t.amount || 0);
    if (amount >= 0) continue; // money-out only
    const categoryId = t.category_id;
    if (!categoryId) continue;
    if (isIncomeCategory(categoryId, categories)) continue; // ADR-069

    const byPlace = byCategory.get(categoryId) ?? new Map<string | null, number>();
    const institutionId = t.institution_id ?? null;
    byPlace.set(institutionId, (byPlace.get(institutionId) ?? 0) + Math.abs(amount));
    byCategory.set(categoryId, byPlace);
  }

  const rows: DailyCategorySpend[] = [];
  for (const [categoryId, byPlace] of byCategory) {
    const byInstitution = [...byPlace.entries()]
      .map(([institutionId, amount]) => ({
        institutionId,
        institution: institutionId
          ? (institutions.find((i) => i.id === institutionId) ?? null)
          : null,
        amount,
      }))
      .sort((a, b) => b.amount - a.amount);
    const total = byInstitution.reduce((sum, i) => sum + i.amount, 0);
    rows.push({
      categoryId,
      category: categories.find((c) => c.id === categoryId) ?? null,
      total,
      byInstitution,
    });
  }
  return rows.sort((a, b) => b.total - a.total);
}

export type PaidItem = {
  kind: "bill" | "debt";
  id: string;
  name: string;
  categoryId: string | null;
  amount: number;
};

/**
 * Bills/debts paid on `day`, keyed by `transaction_date` (never
 * `cleared_date` — ADR-100/ADR-108), including pending and cleared
 * transactions alike. Groups multiple same-day payments against the same
 * bill/debt into one row (a rare case, e.g. a payment plus its reversal).
 */
export function billsDebtsPaidOnDay(
  transactions: Transaction[],
  bills: Bill[],
  debts: Debt[],
  day: string,
): PaidItem[] {
  const byBill = new Map<string, number>();
  const byDebt = new Map<string, number>();

  for (const t of transactions) {
    if ((t.transaction_date ?? "").slice(0, 10) !== day) continue;
    const amount = Number(t.amount || 0);
    if (t.linked_bill_id) {
      byBill.set(t.linked_bill_id, (byBill.get(t.linked_bill_id) ?? 0) + amount);
    } else if (t.linked_debt_id) {
      byDebt.set(t.linked_debt_id, (byDebt.get(t.linked_debt_id) ?? 0) + amount);
    }
  }

  const items: PaidItem[] = [];
  for (const [billId, amount] of byBill) {
    const bill = bills.find((b) => b.id === billId);
    items.push({
      kind: "bill",
      id: billId,
      name: bill?.name ?? "Unknown bill",
      categoryId: bill?.category_id ?? null,
      amount,
    });
  }
  for (const [debtId, amount] of byDebt) {
    const debt = debts.find((d) => d.id === debtId);
    items.push({
      kind: "debt",
      id: debtId,
      name: debt?.name ?? "Unknown debt",
      categoryId: debt?.category_id ?? null,
      amount,
    });
  }
  return items.sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
}

export type DailySpendPoint = { date: string; amount: number };

/**
 * Total money-out per day across `[start, end)` — used by the Dashboard's
 * daily-spend chart. Unlike `dailySpendByCategory`, this intentionally
 * includes bill/debt payments (ADR-108: the chart reflects real daily
 * outflow, matching `dayMoneyInOut`'s `out`, not discretionary-only spend).
 */
export function dailySpendSeries(
  transactions: Transaction[],
  internalTransferGroupIds: Set<string>,
  start: string,
  endExclusive: string,
): DailySpendPoint[] {
  const byDay = new Map<string, number>();
  for (const t of transactions) {
    const date = (t.transaction_date ?? "").slice(0, 10);
    if (!date || date < start || date >= endExclusive) continue;
    if (t.transfer_group_id && internalTransferGroupIds.has(t.transfer_group_id)) continue;
    const amount = Number(t.amount || 0);
    if (amount >= 0) continue;
    byDay.set(date, (byDay.get(date) ?? 0) + Math.abs(amount));
  }

  const points: DailySpendPoint[] = [];
  for (let d = start; d < endExclusive; d = addDaysISO(d, 1)) {
    points.push({ date: d, amount: byDay.get(d) ?? 0 });
  }
  return points;
}
