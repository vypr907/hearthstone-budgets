import type { SpendingActual, Transaction } from "./supabase";
import { monthKey } from "./data-hooks";

/**
 * Current-month actuals come from the ledger when a category has any logged
 * transactions that month; otherwise the manually entered monthly total is
 * used as a fallback.
 */
export function buildActualResolver(
  actuals: SpendingActual[],
  transactions: Transaction[],
) {
  const fromLedger = new Map<string, number>();
  for (const t of transactions) {
    if (!t.category_id) continue;
    const amount = Number(t.amount || 0);
    if (amount >= 0) continue; // only money out counts as spend
    const d = new Date(t.transaction_date);
    const key = `${t.category_id}|${monthKey(d)}`;
    fromLedger.set(key, (fromLedger.get(key) ?? 0) + Math.abs(amount));
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
      const row = manual.get(key);
      // ADR-041: a manual override wins over the ledger sum.
      if (row?.is_manual_override) {
        return {
          amount: Number(row.actual_amount || 0),
          source: "override" as const,
          rowId: row.id,
          hasRow: true,
          hasLedger: ledger !== undefined,
        };
      }
      if (ledger !== undefined) {
        return {
          amount: ledger,
          source: "ledger" as const,
          rowId: row?.id,
          hasRow: !!row,
          hasLedger: true,
        };
      }
      return {
        amount: row ? Number(row.actual_amount || 0) : 0,
        source: "manual" as const,
        rowId: row?.id,
        hasRow: !!row,
        hasLedger: false,
      };
    },
    /** True when the month has any manual row or ledger spend. */
    has(categoryId: string, month: string) {
      const key = `${categoryId}|${month}`;
      return fromLedger.has(key) || manual.has(key);
    },
  };
}
