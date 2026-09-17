/**
 * Lightweight cross-route filter store for pre-filtering the Transactions
 * screen when navigating from Spending or Dashboard cards.
 * Intentionally mutable module state — it's read once on mount and cleared.
 */
export type TxPreFilter = {
  categoryId?: string;
  /** Drill-down from a parent-category tile: match any of these categories. */
  categoryIds?: string[];
  /** Narrow to bill/debt payments ("linked") or plain spending ("unlinked"). */
  linked?: "linked" | "unlinked";
  dateFrom?: string;
  dateTo?: string;
  /** ADR-089: hide two-sided transfers so the list matches the budget figure. */
  excludeInternalTransfers?: boolean;
  /** ADR-104: drill-down from the Tags screen. */
  tagId?: string;
  /** Drill-down from an institution's "Recent Transactions" section. */
  institutionId?: string;
  label?: string;
};

let pending: TxPreFilter | null = null;

export function setTxPreFilter(f: TxPreFilter) {
  pending = f;
}

/** Read and clear the pending pre-filter (consume-once semantics). */
export function consumeTxPreFilter(): TxPreFilter | null {
  const f = pending;
  pending = null;
  return f;
}
