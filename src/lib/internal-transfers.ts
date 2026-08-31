import type { Transaction } from "./supabase";

/**
 * ADR-089: a transfer (ADR-056) is only "internal" — money moved between the
 * household's own accounts — when BOTH legs exist in the ledger: a negative row
 * and a positive row sharing the same `transfer_group_id`. Internal transfers
 * are never spending.
 *
 * A one-sided transfer leg (no matching counterpart row) means the money truly
 * left the household, so it keeps counting as spend.
 *
 * @returns the set of `transfer_group_id`s that are internal (two-sided).
 */
export function internalTransferIds(transactions: Transaction[] = []): Set<string> {
  const neg = new Set<string>();
  const pos = new Set<string>();
  for (const t of transactions) {
    const gid = t.transfer_group_id ?? null;
    if (!gid) continue;
    const amount = Number(t.amount || 0);
    if (amount < 0) neg.add(gid);
    else if (amount > 0) pos.add(gid);
  }
  const out = new Set<string>();
  for (const gid of neg) if (pos.has(gid)) out.add(gid);
  return out;
}

/** True when this row is one leg of a two-sided (internal) transfer. */
export function isInternalTransfer(t: Transaction, internal: Set<string>): boolean {
  const gid = t.transfer_group_id ?? null;
  return !!gid && internal.has(gid);
}
