import type { Account, AccountBalance, Transaction } from "./supabase";

export type AccountBalanceInfo = {
  anchor: number;
  current: number;
  spendable: number;
  asOf: string | null;
};

/**
 * Anchor = latest account_balances snapshot, else starting_balance.
 * Current  = anchor + cleared transactions dated after the anchor.
 * Spendable = anchor + cleared AND pending transactions after the anchor.
 */
export function computeBalances(
  accounts: Account[],
  latest: Record<string, AccountBalance | undefined>,
  transactions: Transaction[],
): Record<string, AccountBalanceInfo> {
  const out: Record<string, AccountBalanceInfo> = {};
  for (const a of accounts) {
    const snap = latest[a.id];
    const anchor = snap ? Number(snap.balance) : Number(a.starting_balance ?? 0);
    const since = snap ? snap.as_of_date.slice(0, 10) : null;
    let cleared = 0;
    let pending = 0;
    for (const t of transactions) {
      if (t.account_id !== a.id) continue;
      if (since && t.transaction_date.slice(0, 10) <= since) continue;
      if (t.status === "cleared") cleared += Number(t.amount || 0);
      else if (t.status === "pending") pending += Number(t.amount || 0);
    }
    out[a.id] = {
      anchor,
      current: anchor + cleared,
      spendable: anchor + cleared + pending,
      asOf: since,
    };
  }
  return out;
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/** Account types that may count toward the combined spendable total. */
export const SPENDABLE_TYPES = ["checking", "credit"];
/** Never counted as spendable, regardless of is_spendable. */
export const EXCLUDED_TYPES = ["savings", "investment", "retirement"];

export function isSpendableAccount(a: Account): boolean {
  const t = norm(a.account_type);
  if (EXCLUDED_TYPES.includes(t)) return false;
  if (!SPENDABLE_TYPES.includes(t)) return false;
  return a.is_spendable === true;
}

export function accountTypeIs(a: Account, type: string): boolean {
  return norm(a.account_type) === type;
}

/** Amount owed on a credit account (balances may be stored signed either way). */
export function creditOwed(balance: number): number {
  return Math.abs(balance);
}
