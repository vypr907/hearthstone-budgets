import type { Account, AccountBalance, Transaction } from "./supabase";

export type NetWorthPoint = {
  /** ISO date the point is measured at (month end / today). */
  date: string;
  label: string;
  total: number;
  /** Total per account_type, e.g. { checking: 120, credit: -400 }. */
  byType: Record<string, number>;
};

/**
 * Balance for one account as of `date`: the most recent snapshot on or before
 * that date (or starting_balance when there is none), plus every cleared
 * transaction dated after that snapshot and on or before `date`.
 */
export function balanceAsOf(
  account: Account,
  balances: AccountBalance[],
  transactions: Transaction[],
  date: string,
): number {
  const day = date.slice(0, 10);
  let snap: AccountBalance | undefined;
  for (const b of balances) {
    if (b.account_id !== account.id) continue;
    const d = b.as_of_date.slice(0, 10);
    if (d > day) continue;
    if (!snap || d > snap.as_of_date.slice(0, 10)) snap = b;
  }
  const anchor = snap ? Number(snap.balance) : Number(account.starting_balance ?? 0);
  const since = snap ? snap.as_of_date.slice(0, 10) : null;
  let delta = 0;
  for (const t of transactions) {
    if (t.account_id !== account.id) continue;
    if (t.status !== "cleared") continue;
    const d = t.transaction_date.slice(0, 10);
    if (d > day) continue;
    if (since && d <= since) continue;
    delta += Number(t.amount || 0);
  }
  return anchor + delta;
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

/** Month-end net worth points for the trailing `months` months, ending today. */
export function netWorthTrend(
  accounts: Account[],
  balances: AccountBalance[],
  transactions: Transaction[],
  months = 6,
  today: Date = new Date(),
): NetWorthPoint[] {
  const points: NetWorthPoint[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const end =
      i === 0
        ? today
        : new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    const date = iso(end);
    const byType: Record<string, number> = {};
    let total = 0;
    for (const a of accounts) {
      const v = balanceAsOf(a, balances, transactions, date);
      const type = (a.account_type ?? "other").toLowerCase();
      byType[type] = (byType[type] ?? 0) + v;
      total += v;
    }
    points.push({
      date,
      label: end.toLocaleDateString("en-US", { month: "short" }),
      total,
      byType,
    });
  }
  return points;
}
