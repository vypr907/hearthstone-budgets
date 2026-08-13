/**
 * Lightweight cross-route filter store for pre-filtering the Transactions
 * screen when navigating from Spending or Dashboard cards.
 * Intentionally mutable module state — it's read once on mount and cleared.
 */
export type TxPreFilter = {
  categoryId?: string;
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
