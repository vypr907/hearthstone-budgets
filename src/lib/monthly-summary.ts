import type { Bill, Category, Debt, Transaction } from "./supabase";
import { categoryDomain, monthKey } from "./data-hooks";
import { monthlyEquivalent } from "./format";
import { isPaycheckDeducted } from "./paycheck-budget";

function incomeCategoryIds(categories: Category[] = []): Set<string> {
  return new Set(
    categories.filter((c) => categoryDomain(c) === "income").map((c) => c.id),
  );
}

/**
 * ADR-073: monthly-equivalent minimum-payment load per category, mirroring
 * `billsBudgetedByCategory`. Paycheck-deducted debts (ADR-032) are excluded —
 * they never touch spendable cash, same as everywhere else obligations are totaled.
 */
export function debtsBudgetedByCategory(
  debts: Debt[],
  categories: Category[] = [],
): Map<string, number> {
  const income = incomeCategoryIds(categories);
  const out = new Map<string, number>();
  for (const d of debts) {
    if (d.date_paid_off) continue;
    if (isPaycheckDeducted(d)) continue;
    if (!d.category_id) continue;
    if (income.has(d.category_id)) continue;
    const monthly = monthlyEquivalent({
      amount: d.minimum_payment,
      billing_cycle: d.billing_cycle,
      cycle_interval_days: d.cycle_interval_days,
    });
    if (monthly == null || !Number.isFinite(monthly)) continue;
    out.set(d.category_id, (out.get(d.category_id) ?? 0) + monthly);
  }
  return out;
}

export type CategoryActual = {
  spendingSpent: number;
  billsSpent: number;
  debtsSpent: number;
  total: number;
};

/** ADR-073: combined bills+debts+spending actual per category for one calendar month. */
export function combinedActualByCategory(
  transactions: Transaction[],
  bills: Bill[],
  debts: Debt[],
  categories: Category[],
  month: string,
): Map<string, CategoryActual> {
  const income = incomeCategoryIds(categories);
  const billCategory = new Map(bills.map((b) => [b.id, b.category_id ?? null]));
  const debtCategory = new Map(debts.map((d) => [d.id, d.category_id ?? null]));
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
    if (monthKey(new Date(t.transaction_date)) !== month) continue;
    const amount = Number(t.amount || 0);
    if (amount >= 0) continue; // only money out counts as spend
    const linkedBillId = t.linked_bill_id ?? null;
    const linkedDebtId = t.linked_debt_id ?? null;
    if (linkedDebtId && deductedDebtIds.has(linkedDebtId)) continue; // ADR-032: never spendable cash
    const categoryId =
      t.category_id ??
      (linkedBillId ? billCategory.get(linkedBillId) ?? null : null) ??
      (linkedDebtId ? debtCategory.get(linkedDebtId) ?? null : null);
    if (!categoryId) continue;
    if (income.has(categoryId)) continue; // ADR-069
    if (linkedDebtId) bump(categoryId, "debtsSpent", Math.abs(amount));
    else if (linkedBillId) bump(categoryId, "billsSpent", Math.abs(amount));
    else bump(categoryId, "spendingSpent", Math.abs(amount));
  }
  return out;
}

/**
 * ADR-073: average of `combinedActualByCategory`'s total per category across the
 * `months` full calendar months immediately before `throughMonth` — `throughMonth`
 * itself is never included, since it's usually still in progress.
 */
export function trailingAverageByCategory(
  transactions: Transaction[],
  bills: Bill[],
  debts: Debt[],
  categories: Category[],
  throughMonth: string,
  months = 6,
): Map<string, number> {
  const [y, m] = throughMonth.split("-").map(Number);
  const totals = new Map<string, number>();
  for (let i = 1; i <= months; i++) {
    const d = new Date(y, m - 1 - i, 1);
    const monthActuals = combinedActualByCategory(transactions, bills, debts, categories, monthKey(d));
    for (const [categoryId, row] of monthActuals) {
      totals.set(categoryId, (totals.get(categoryId) ?? 0) + row.total);
    }
  }
  const out = new Map<string, number>();
  for (const [categoryId, total] of totals) out.set(categoryId, total / months);
  return out;
}
