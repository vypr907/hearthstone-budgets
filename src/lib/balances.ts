import type { Account, AccountBalance, Bill, Debt, Transaction } from "./supabase";
import { debtDueDate } from "./format";
import { todayISO } from "./snapshot";
import { billCycleDue, billRemainingOwed } from "./payments";

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

/**
 * ADR-023: what one account contributes to the COMBINED household spendable
 * total. Checking contributes its raw spendable balance; credit contributes
 * available credit (limit - owed). Returns null when the account should be
 * excluded from the total — credit accounts with no credit_limit entered.
 * Per-account displays keep using the balance-based value, not this.
 */
export function spendableContribution(
  account: Account,
  spendable: number,
): number | null {
  if (!isSpendableAccount(account)) return null;
  if (accountTypeIs(account, "credit")) {
    const limit = Number(account.credit_limit ?? 0);
    if (!limit) return null;
    return limit - creditOwed(spendable);
  }
  return spendable;
}

/** Credit accounts included in the total but missing a usable credit_limit. */
export function creditAccountsMissingLimit(accounts: Account[]): Account[] {
  return accounts.filter(
    (a) =>
      isSpendableAccount(a) &&
      accountTypeIs(a, "credit") &&
      !Number(a.credit_limit ?? 0),
  );
}

/**
 * ADR-027: a savings goal's current amount, derived exactly like account
 * balances — the sum of CLEARED transactions linked to that goal. Never stored.
 */
export function computeGoalBalances(
  goalIds: string[],
  transactions: Transaction[],
): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of goalIds) out[id] = 0;
  for (const t of transactions) {
    const gid = t.linked_goal_id;
    if (!gid || !(gid in out)) continue;
    if (t.status !== "cleared") continue;
    out[gid] += Number(t.amount || 0);
  }
  return out;
}

/** Months (>= 1) between today and a target date; null when no date is set. */
export function monthsRemaining(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null;
  const now = new Date();
  const t = new Date(`${targetDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  const months =
    (t.getFullYear() - now.getFullYear()) * 12 + (t.getMonth() - now.getMonth());
  return Math.max(1, months);
}

/** Whole days left until a target date; null when no date is set. */
export function daysRemaining(targetDate: string | null | undefined): number | null {
  if (!targetDate) return null;
  const t = new Date(`${targetDate.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t.getTime())) return null;
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((t.getTime() - today.getTime()) / 86400000);
}

/**
 * ADR-031: institution-level computed totals. Never stored — derived on render.
 *
 * - Accounts linked → Current Balance = sum of those accounts' current balance;
 *   no Current Due.
 * - No accounts, but bills/debts linked → Current Balance = open debt balances
 *   + open-cycle bill amounts; Current Due = still-owed bill amounts this cycle
 *   + minimum payments for debts due on/before today.
 * - Nothing linked → both null.
 */
export type InstitutionTotals = {
  source: "accounts" | "obligations" | "none";
  currentBalance: number | null;
  currentDue: number | null;
};

export function computeInstitutionTotals(
  institutionId: string,
  accounts: Account[],
  balances: Record<string, AccountBalanceInfo>,
  bills: Bill[],
  debts: Debt[],
): InstitutionTotals {
  const linkedAccounts = accounts.filter((a) => a.institution_id === institutionId);
  if (linkedAccounts.length > 0) {
    const total = linkedAccounts.reduce(
      (sum, a) => sum + (balances[a.id]?.current ?? Number(a.starting_balance ?? 0)),
      0,
    );
    return { source: "accounts", currentBalance: total, currentDue: null };
  }

  const linkedBills = bills.filter(
    (b) => b.institution_id === institutionId && b.is_active !== false,
  );
  const linkedDebts = debts.filter(
    (d) => d.institution_id === institutionId && !d.date_paid_off,
  );
  if (linkedBills.length === 0 && linkedDebts.length === 0)
    return { source: "none", currentBalance: null, currentDue: null };

  const today = todayISO();
  let balance = 0;
  let due = 0;

  for (const b of linkedBills) {
    const owed = billRemainingOwed(b);
    if (owed <= 0) continue;
    balance += billCycleDue(b);
    due += owed;
  }

  for (const d of linkedDebts) {
    const remaining = Number(d.remaining_balance ?? 0);
    if (remaining > 0) balance += remaining;
    const dueDate = debtDueDate(d);
    if (dueDate && dueDate <= today) due += Number(d.minimum_payment ?? 0);
  }

  return { source: "obligations", currentBalance: balance, currentDue: due };
}
