import type { Bill, SpendingActual, Transaction } from "./supabase";
import { monthKey } from "./data-hooks";
import { monthlyEquivalent } from "./format";

/**
 * Current-month actuals come from the ledger when a category has any logged
 * transactions that month; otherwise the manually entered monthly total is
 * used as a fallback.
 *
 * ADR-034: the ledger sum is additionally split into ordinary spending vs.
 * payments already made against bills linked to that category, so the UI can
 * always show the two parts rather than one opaque number.
 */
export function buildActualResolver(
  actuals: SpendingActual[],
  transactions: Transaction[],
  bills: Bill[] = [],
) {
  const billCategory = new Map<string, string | null>(
    bills.map((b) => [b.id, b.category_id ?? null]),
  );

  const fromLedger = new Map<string, number>();
  const billsLedger = new Map<string, number>();
  for (const t of transactions) {
    const linkedBillId = t.linked_bill_id ?? null;
    const categoryId =
      t.category_id ?? (linkedBillId ? (billCategory.get(linkedBillId) ?? null) : null);
    if (!categoryId) continue;
    const amount = Number(t.amount || 0);
    if (amount >= 0) continue; // only money out counts as spend
    const d = new Date(t.transaction_date);
    const key = `${categoryId}|${monthKey(d)}`;
    fromLedger.set(key, (fromLedger.get(key) ?? 0) + Math.abs(amount));
    if (linkedBillId)
      billsLedger.set(key, (billsLedger.get(key) ?? 0) + Math.abs(amount));
  }

  const manual = new Map<string, SpendingActual>();
  for (const a of actuals) {
    if (!a.category_id) continue;
    manual.set(`${a.category_id}|${a.month?.slice(0, 10)}`, a);
  }

  return {
    /** Resolved actual for a category in a month, plus its source. */
    resolve(categoryId: string, month: string) {
      const key = `${categoryId}|${month}`;
      const ledger = fromLedger.get(key);
      const billsSpent = billsLedger.get(key) ?? 0;
      const row = manual.get(key);
      // ADR-041: a manual override wins over the ledger sum.
      if (row?.is_manual_override) {
        const amount = Number(row.actual_amount || 0);
        return {
          amount,
          source: "override" as const,
          rowId: row.id,
          hasRow: true,
          hasLedger: ledger !== undefined,
          billsSpent: 0,
          spendingSpent: amount,
        };
      }
      if (ledger !== undefined) {
        return {
          amount: ledger,
          source: "ledger" as const,
          rowId: row?.id,
          hasRow: !!row,
          hasLedger: true,
          billsSpent,
          spendingSpent: Math.max(0, ledger - billsSpent),
        };
      }
      const amount = row ? Number(row.actual_amount || 0) : 0;
      return {
        amount,
        source: "manual" as const,
        rowId: row?.id,
        hasRow: !!row,
        hasLedger: false,
        billsSpent: 0,
        spendingSpent: amount,
      };
    },
    /** True when the month has any manual row or ledger spend. */
    has(categoryId: string, month: string) {
      const key = `${categoryId}|${month}`;
      return fromLedger.has(key) || manual.has(key);
    },
  };
}

/**
 * ADR-034: monthly-equivalent bill load per category — the "+ $Y bills" half of
 * the budgeted figure. Bills with an unusable custom cycle contribute nothing.
 */
export function billsBudgetedByCategory(bills: Bill[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const b of bills) {
    if (b.is_active === false) continue;
    if (!b.category_id) continue;
    const monthly = monthlyEquivalent(b);
    if (monthly == null || !Number.isFinite(monthly)) continue;
    out.set(b.category_id, (out.get(b.category_id) ?? 0) + monthly);
  }
  return out;
}
