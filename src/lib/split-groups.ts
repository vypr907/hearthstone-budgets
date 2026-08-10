import type { Transaction } from "./supabase";

/**
 * ADR-044 presentation helper: collapse rows that share a split_group_id into a
 * single entry so ledger lists show one card per real-world transaction.
 */
export type LedgerEntry = {
  /** Stable key: the split group id when split, else the transaction id. */
  key: string;
  /** Representative row (first/newest in the group) for date, account, status. */
  head: Transaction;
  /** All rows in this entry — one when unsplit. */
  rows: Transaction[];
  /** Signed sum of every row's amount. */
  total: number;
  isSplit: boolean;
};

export function groupLedgerRows(rows: Transaction[]): LedgerEntry[] {
  const out: LedgerEntry[] = [];
  const byGroup = new Map<string, LedgerEntry>();
  for (const t of rows) {
    const gid = t.split_group_id ?? null;
    if (!gid) {
      out.push({ key: t.id, head: t, rows: [t], total: Number(t.amount ?? 0), isSplit: false });
      continue;
    }
    const existing = byGroup.get(gid);
    if (existing) {
      existing.rows.push(t);
      existing.total += Number(t.amount ?? 0);
      continue;
    }
    const entry: LedgerEntry = {
      key: gid,
      head: t,
      rows: [t],
      total: Number(t.amount ?? 0),
      isSplit: true,
    };
    byGroup.set(gid, entry);
    out.push(entry);
  }
  return out;
}
