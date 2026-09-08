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

/**
 * What kind of `split_group_id` group a set of rows is (ADR-047 addendum).
 * - `category-split`: a genuine ADR-044 split — one account, N category lines.
 *   Safe to edit as a whole group via SplitTransactionDetail.
 * - `paycheck`: deposits auto-posted by "mark income received" (ADR-047/055) —
 *   the group id IS an income_events.id. Edited one deposit at a time.
 * - `linked-or-multi`: spans >1 account or contains a bill/debt-linked row
 *   (a hand-built multi-account split, or an ADR-046 payment+fee group).
 *   Also edited one row at a time; the whole-group editor would corrupt it.
 */
export type LedgerGroupKind =
  | "category-split"
  | "paycheck"
  | "payment-with-fees"
  | "linked-or-multi";

/**
 * ADR-091: exactly one bill/debt-linked row on a single account, plus any
 * number of plain fee/charge lines — the ADR-046 payment+fee shape. Safe for
 * the grouped editor because only one payable has to be kept in sync.
 */
export function isPaymentWithFeesGroup(rows: Transaction[]): boolean {
  const accounts = new Set(rows.map((r) => r.account_id ?? null));
  if (accounts.size > 1) return false;
  const linked = rows.filter((r) => r.linked_bill_id || r.linked_debt_id);
  return linked.length === 1 && rows.length > 1;
}

export function classifyLedgerGroup(
  rows: Transaction[],
  groupId: string,
  incomeEventIds: ReadonlySet<string>,
): LedgerGroupKind {
  if (incomeEventIds.has(groupId)) return "paycheck";
  const accounts = new Set(rows.map((r) => r.account_id ?? null));
  const hasLinked = rows.some((r) => r.linked_bill_id || r.linked_debt_id);
  if (isPaymentWithFeesGroup(rows)) return "payment-with-fees";
  if (accounts.size > 1 || hasLinked) return "linked-or-multi";
  return "category-split";
}


/** True only for a genuine ADR-044 category split (safe for the group editor). */
export function isCategorySplitGroup(
  rows: Transaction[],
  groupId: string,
  incomeEventIds: ReadonlySet<string>,
): boolean {
  return classifyLedgerGroup(rows, groupId, incomeEventIds) === "category-split";
}

/**
 * Guard for the destructive whole-group split writes (delete-all + re-insert
 * onto one account). Throws for a group that spans multiple accounts or holds a
 * bill/debt-linked row — i.e. a paycheck/deduction or payment+fee group that
 * must be edited row by row instead.
 */
export function assertCategorySplitRows(
  rows: Array<Pick<Transaction, "account_id" | "linked_bill_id" | "linked_debt_id">>,
): void {
  if (new Set(rows.map((r) => r.account_id ?? null)).size > 1) {
    throw new Error(
      "This deposit group spans multiple accounts (a paycheck or transfer) — edit each deposit from the ledger instead of the split editor.",
    );
  }
  if (rows.some((r) => r.linked_bill_id || r.linked_debt_id)) {
    throw new Error(
      "This group contains a bill or debt payment — correct it from that bill or debt, not the split editor.",
    );
  }
}

export function groupLedgerRows(rows: Transaction[]): LedgerEntry[] {
  // ADR-097: a split_group_id shared by only one row (e.g. a solo transfer
  // fee, paired to its transfer via split_group_id but with no sibling row
  // in the ledger) isn't a real split — treat it exactly like an ungrouped
  // row instead of showing a "Split · 1" card with nothing to break down.
  const groupSize = new Map<string, number>();
  for (const t of rows) {
    const gid = t.split_group_id ?? null;
    if (gid) groupSize.set(gid, (groupSize.get(gid) ?? 0) + 1);
  }

  const out: LedgerEntry[] = [];
  const byGroup = new Map<string, LedgerEntry>();
  for (const t of rows) {
    const gid = t.split_group_id ?? null;
    const isRealGroup = !!gid && (groupSize.get(gid) ?? 0) > 1;
    if (!isRealGroup) {
      out.push({ key: t.id, head: t, rows: [t], total: Number(t.amount ?? 0), isSplit: false });
      continue;
    }
    const existing = byGroup.get(gid!);
    if (existing) {
      existing.rows.push(t);
      existing.total += Number(t.amount ?? 0);
      continue;
    }
    const entry: LedgerEntry = {
      key: gid!,
      head: t,
      rows: [t],
      total: Number(t.amount ?? 0),
      isSplit: true,
    };
    byGroup.set(gid!, entry);
    out.push(entry);
  }
  return out;
}
